-- =============================================================================
-- Migration 003 — User Vault + Onboarding
-- =============================================================================
-- Tracks files the user has staged in their personal vault (R2 keys under
-- `users/{uid}/vault/{folder}/...`), plus per-user storage stats and the
-- onboarding state needed to route first-time users through the guided flow.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Onboarding state on profiles ───────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT NOT NULL DEFAULT 'vault'
    CHECK (onboarding_step IN ('vault', 'sources', 'import', 'studio', 'done')),
  ADD COLUMN IF NOT EXISTS vault_name TEXT,
  ADD COLUMN IF NOT EXISTS vault_storage_bytes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vault_file_count INTEGER NOT NULL DEFAULT 0;

-- ─── Vault files index ──────────────────────────────────────────────────────
-- One row per file persisted into the user's vault folders. The R2 key is
-- canonical; columns mirror what we need for the vault browser UI.

CREATE TABLE IF NOT EXISTS public.vault_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  folder TEXT NOT NULL CHECK (folder IN ('references', 'footage', 'exports')),

  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,

  kind TEXT NOT NULL CHECK (kind IN ('video', 'image', 'audio', 'other')),
  source TEXT NOT NULL DEFAULT 'upload'
    CHECK (source IN ('upload', 'google_drive', 'dropbox', 'icloud', 'url', 'render')),

  -- Optional pointers
  edit_id UUID REFERENCES public.edits(id) ON DELETE SET NULL,
  thumbnail_url TEXT,
  duration_ms INTEGER,
  external_url TEXT,
  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_files_user_folder
  ON public.vault_files(user_id, folder, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_files_user_kind
  ON public.vault_files(user_id, kind);

ALTER TABLE public.vault_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vault_files_select_own" ON public.vault_files;
CREATE POLICY "vault_files_select_own" ON public.vault_files
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "vault_files_insert_own" ON public.vault_files;
CREATE POLICY "vault_files_insert_own" ON public.vault_files
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vault_files_update_own" ON public.vault_files;
CREATE POLICY "vault_files_update_own" ON public.vault_files
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "vault_files_delete_own" ON public.vault_files;
CREATE POLICY "vault_files_delete_own" ON public.vault_files
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_vault_files_updated_at ON public.vault_files;
CREATE TRIGGER update_vault_files_updated_at
  BEFORE UPDATE ON public.vault_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Stats maintenance ──────────────────────────────────────────────────────
-- Keep profiles.vault_storage_bytes / vault_file_count in sync with inserts
-- and deletes. We only count this user's rows so the trigger is cheap.

CREATE OR REPLACE FUNCTION public.bump_vault_stats() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
      SET vault_storage_bytes = vault_storage_bytes + COALESCE(NEW.size_bytes, 0),
          vault_file_count    = vault_file_count + 1
      WHERE id = NEW.user_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
      SET vault_storage_bytes = GREATEST(vault_storage_bytes - COALESCE(OLD.size_bytes, 0), 0),
          vault_file_count    = GREATEST(vault_file_count - 1, 0)
      WHERE id = OLD.user_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only adjust when size actually changes
    IF COALESCE(NEW.size_bytes, 0) <> COALESCE(OLD.size_bytes, 0) THEN
      UPDATE public.profiles
        SET vault_storage_bytes = GREATEST(
              vault_storage_bytes - COALESCE(OLD.size_bytes, 0) + COALESCE(NEW.size_bytes, 0),
              0
            )
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vault_files_stats_trigger ON public.vault_files;
CREATE TRIGGER vault_files_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.vault_files
  FOR EACH ROW EXECUTE FUNCTION public.bump_vault_stats();
