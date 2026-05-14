-- =============================================================================
-- Migration 003 — Strategy Brain (Pillar 3)
-- =============================================================================
-- Brings db/strategy_brain.sql into the migration sequence so it gets applied
-- alongside the base schema. Every table / index / trigger / policy here is
-- IF NOT EXISTS or DROP-then-CREATE-guarded so this migration is safe to
-- re-run on databases that already loaded db/strategy_brain.sql directly.
--
-- Tables:
--   * content_calendar    — AI-suggested + user-confirmed posting slots
--   * content_performance — Historical post metrics (views, ER, completion)
--   * trend_cache         — Platform trends snapshot (audio, hashtags, formats)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── content_calendar ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  scheduled_date TIMESTAMPTZ NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN (
    'youtube', 'tiktok', 'instagram', 'twitter', 'facebook', 'linkedin'
  )),
  content_type TEXT NOT NULL CHECK (content_type IN (
    'educational', 'entertaining', 'trending', 'series', 'promotional', 'community'
  )),

  strategy_brief JSONB NOT NULL DEFAULT '{}',

  style_dna_id UUID REFERENCES public.style_dna(id) ON DELETE SET NULL,
  edit_id UUID REFERENCES public.edits(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN (
    'suggested', 'confirmed', 'in_progress', 'published', 'skipped'
  )),

  ai_confidence NUMERIC(3, 2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_calendar_user_id
  ON public.content_calendar(user_id);
CREATE INDEX IF NOT EXISTS idx_content_calendar_user_date
  ON public.content_calendar(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_content_calendar_status
  ON public.content_calendar(status);

-- ─── content_performance ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  edit_id UUID REFERENCES public.edits(id) ON DELETE SET NULL,
  distribution_id UUID REFERENCES public.distributions(id) ON DELETE SET NULL,
  calendar_id UUID REFERENCES public.content_calendar(id) ON DELETE SET NULL,

  platform TEXT NOT NULL CHECK (platform IN (
    'youtube', 'tiktok', 'instagram', 'twitter', 'facebook', 'linkedin'
  )),
  post_url TEXT,

  views BIGINT NOT NULL DEFAULT 0,
  likes BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  saves BIGINT NOT NULL DEFAULT 0,
  watch_time_seconds BIGINT,

  completion_rate NUMERIC(4, 3),
  engagement_rate NUMERIC(4, 3),

  topic TEXT,
  format TEXT,
  hook_pattern TEXT,
  duration_seconds INTEGER,

  posted_at TIMESTAMPTZ NOT NULL,
  metrics_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_performance_user_id
  ON public.content_performance(user_id);
CREATE INDEX IF NOT EXISTS idx_content_performance_user_posted
  ON public.content_performance(user_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_performance_platform
  ON public.content_performance(platform);

-- ─── trend_cache ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trend_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform TEXT NOT NULL CHECK (platform IN (
    'youtube', 'tiktok', 'instagram', 'twitter', 'facebook', 'linkedin'
  )),
  trend_type TEXT NOT NULL CHECK (trend_type IN (
    'audio', 'hashtag', 'format', 'topic', 'effect'
  )),
  trend_data JSONB NOT NULL,
  niche TEXT,
  score NUMERIC(5, 2),

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '6 hours')
);

CREATE INDEX IF NOT EXISTS idx_trend_cache_platform_type
  ON public.trend_cache(platform, trend_type);
CREATE INDEX IF NOT EXISTS idx_trend_cache_expires
  ON public.trend_cache(expires_at);

-- ─── Triggers ──────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS update_content_calendar_updated_at ON public.content_calendar;
CREATE TRIGGER update_content_calendar_updated_at
  BEFORE UPDATE ON public.content_calendar
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Row Level Security ────────────────────────────────────────────────────

ALTER TABLE public.content_calendar    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_cache         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own calendar" ON public.content_calendar;
CREATE POLICY "Users can view own calendar"
  ON public.content_calendar FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create calendar entries" ON public.content_calendar;
CREATE POLICY "Users can create calendar entries"
  ON public.content_calendar FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own calendar" ON public.content_calendar;
CREATE POLICY "Users can update own calendar"
  ON public.content_calendar FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own calendar" ON public.content_calendar;
CREATE POLICY "Users can delete own calendar"
  ON public.content_calendar FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own performance" ON public.content_performance;
CREATE POLICY "Users can view own performance"
  ON public.content_performance FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create performance" ON public.content_performance;
CREATE POLICY "Users can create performance"
  ON public.content_performance FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own performance" ON public.content_performance;
CREATE POLICY "Users can update own performance"
  ON public.content_performance FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own performance" ON public.content_performance;
CREATE POLICY "Users can delete own performance"
  ON public.content_performance FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can read trends" ON public.trend_cache;
CREATE POLICY "Authenticated users can read trends"
  ON public.trend_cache FOR SELECT
  USING (auth.uid() IS NOT NULL);
