-- =============================================================================
-- Render pipeline hardening
-- =============================================================================
-- Fixes the stuck-render class where route handlers can read/insert render_jobs
-- but cannot update progress/completed/failed state under RLS.

ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update own render jobs" ON public.render_jobs;
CREATE POLICY "Users can update own render jobs"
  ON public.render_jobs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Optional durability fields. Code still stores these in render_config for
-- backwards compatibility with already-deployed schemas, but these columns give
-- the database a first-class home for native-engine exports once the live DB is
-- migrated.
ALTER TABLE public.edits
  ADD COLUMN IF NOT EXISTS output_r2_key TEXT,
  ADD COLUMN IF NOT EXISTS output_vault_file_id UUID;

ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS render_engine TEXT DEFAULT 'shotstack'
    CHECK (render_engine IN ('shotstack', 'a7_engine')),
  ADD COLUMN IF NOT EXISTS engine_version TEXT,
  ADD COLUMN IF NOT EXISTS provider_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS output_r2_key TEXT,
  ADD COLUMN IF NOT EXISTS diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_render_jobs_user_status_created
  ON public.render_jobs(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_edits_output_vault_file_id
  ON public.edits(output_vault_file_id)
  WHERE output_vault_file_id IS NOT NULL;
