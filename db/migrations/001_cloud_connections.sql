-- =============================================================================
-- Migration 001 — Cloud Storage Connections
-- =============================================================================
-- OAuth tokens for cloud storage providers (Google Drive, Dropbox, etc.).
-- Kept separate from `channels` so distribution permissions don't entangle
-- with read-only file-access permissions.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.cloud_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'dropbox', 'onedrive', 'box')),

  account_id TEXT NOT NULL,
  account_email TEXT,
  account_name TEXT,
  account_avatar_url TEXT,

  -- App-level encrypted via AES-256-GCM (see lib/crypto/tokens.ts)
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',

  connection_status TEXT NOT NULL DEFAULT 'connected' CHECK (connection_status IN (
    'connected', 'disconnected', 'expired', 'error'
  )),
  last_used_at TIMESTAMPTZ,
  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, provider, account_id)
);

CREATE INDEX IF NOT EXISTS idx_cloud_connections_user_id ON public.cloud_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_cloud_connections_provider ON public.cloud_connections(provider);

ALTER TABLE public.cloud_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cloud_connections_select_own" ON public.cloud_connections;
CREATE POLICY "cloud_connections_select_own" ON public.cloud_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cloud_connections_insert_own" ON public.cloud_connections;
CREATE POLICY "cloud_connections_insert_own" ON public.cloud_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cloud_connections_update_own" ON public.cloud_connections;
CREATE POLICY "cloud_connections_update_own" ON public.cloud_connections
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cloud_connections_delete_own" ON public.cloud_connections;
CREATE POLICY "cloud_connections_delete_own" ON public.cloud_connections
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_cloud_connections_updated_at ON public.cloud_connections;
CREATE TRIGGER update_cloud_connections_updated_at
  BEFORE UPDATE ON public.cloud_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
