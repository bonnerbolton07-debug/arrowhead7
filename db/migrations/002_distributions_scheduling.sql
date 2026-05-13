-- =============================================================================
-- Migration 002 — Distribution Scheduling + Error Tracking
-- =============================================================================
-- Adds publish_attempts, last_error, and platform-specific upload tracking
-- so the scheduler cron can retry/observe failed publishes.

ALTER TABLE public.distributions
  ADD COLUMN IF NOT EXISTS publish_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.distributions
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE public.distributions
  ADD COLUMN IF NOT EXISTS upload_id TEXT;

-- Index used by the scheduler cron to find due distributions cheaply.
CREATE INDEX IF NOT EXISTS idx_distributions_scheduled_for
  ON public.distributions (scheduled_for)
  WHERE status = 'scheduled';
