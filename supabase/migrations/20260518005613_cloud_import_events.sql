-- =============================================================================
-- Cloud import diagnostics
-- =============================================================================
-- Durable, safe diagnostics for provider-to-vault pulls. This table stores
-- operational breadcrumbs only; no OAuth tokens, provider secrets, raw URLs,
-- or full storage keys should be written here.

CREATE TABLE IF NOT EXISTS public.pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('cloud_import', 'render', 'oauth', 'vault')),
  provider TEXT CHECK (
    provider IS NULL OR provider IN ('google_drive', 'dropbox', 'icloud', 'url', 'shotstack', 'a7_engine')
  ),
  operation TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'progress', 'succeeded', 'failed', 'blocked', 'timeout')),
  http_status INTEGER,
  reason TEXT,
  message TEXT,
  file_size_bytes BIGINT,
  content_type TEXT,
  folder TEXT CHECK (folder IS NULL OR folder IN ('references', 'footage', 'exports')),
  duration_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own pipeline events" ON public.pipeline_events;
CREATE POLICY "Users can view own pipeline events"
  ON public.pipeline_events
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own pipeline events" ON public.pipeline_events;
CREATE POLICY "Users can create own pipeline events"
  ON public.pipeline_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON TABLE public.pipeline_events TO authenticated;

CREATE INDEX IF NOT EXISTS idx_pipeline_events_user_created
  ON public.pipeline_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_request
  ON public.pipeline_events(request_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_area_status_created
  ON public.pipeline_events(area, status, created_at DESC);
