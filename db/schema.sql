-- =============================================================================
-- Arrowhead 7 — Core Database Schema (Supabase / PostgreSQL)
-- =============================================================================
-- Run this against your Supabase project to create the initial tables.
-- Supabase handles auth.users automatically via their auth system.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users Profile ──────────────────────────────────────────────────────────
-- Extends Supabase auth.users with app-specific data

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,

  -- Subscription
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'studio')),
  subscription_status TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'cancelled', 'past_due', 'trialing', 'incomplete')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  current_period_end TIMESTAMPTZ,

  -- Credits (Free: 5/mo, Pro: 50/mo, Studio: unlimited represented as -1)
  credits_remaining INTEGER NOT NULL DEFAULT 5,
  credits_used_total INTEGER NOT NULL DEFAULT 0,

  -- Preferences
  default_resolution TEXT DEFAULT '1080',
  default_format TEXT DEFAULT 'mp4',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Style DNA ──────────────────────────────────────────────────────────────
-- Extracted editing style profiles from reference videos

CREATE TABLE public.style_dna (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Style',
  reference_video_url TEXT NOT NULL,

  -- Extracted parameters (stored as JSONB for flexibility during development)
  cut_pattern JSONB NOT NULL DEFAULT '{}',
  color_profile JSONB NOT NULL DEFAULT '{}',
  pacing JSONB NOT NULL DEFAULT '{}',
  transition_preferences JSONB NOT NULL DEFAULT '[]',
  text_style JSONB,
  audio_sync_strategy TEXT NOT NULL DEFAULT 'none',

  -- Raw analysis data
  raw_analysis JSONB,

  -- Status
  status TEXT NOT NULL DEFAULT 'analyzing' CHECK (status IN ('analyzing', 'ready', 'failed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Edits ──────────────────────────────────────────────────────────────────
-- Core edit projects

CREATE TABLE public.edits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Edit',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'analyzing', 'ready', 'queued', 'rendering', 'completed', 'failed', 'cancelled'
  )),

  -- Source
  source_video_url TEXT,
  source_duration_ms INTEGER,
  source_resolution JSONB,  -- { width, height }

  -- Style DNA reference
  style_dna_id UUID REFERENCES public.style_dna(id) ON DELETE SET NULL,

  -- Reference URLs provided by user (social media links, uploaded videos)
  reference_urls TEXT[] NOT NULL DEFAULT '{}',

  -- Render config
  render_config JSONB,

  -- Output
  output_video_url TEXT,
  output_stream_uid TEXT,
  output_thumbnail_url TEXT,

  -- Credits
  credits_used INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ─── Render Jobs ────────────────────────────────────────────────────────────
-- Tracks Shotstack render progress

CREATE TABLE public.render_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  edit_id UUID NOT NULL REFERENCES public.edits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Shotstack tracking
  shotstack_render_id TEXT,
  shotstack_status TEXT,

  -- Progress
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'uploading', 'completed', 'failed'
  )),
  error_message TEXT,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Channels ───────────────────────────────────────────────────────────────
-- Connected distribution platforms

CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN (
    'youtube', 'tiktok', 'instagram', 'twitter', 'facebook', 'linkedin', 'custom'
  )),
  platform_account_id TEXT NOT NULL,
  platform_account_name TEXT NOT NULL,
  platform_avatar_url TEXT,

  -- OAuth (encrypted)
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',

  -- Status
  connection_status TEXT NOT NULL DEFAULT 'connected' CHECK (connection_status IN (
    'connected', 'disconnected', 'expired', 'error'
  )),
  last_sync_at TIMESTAMPTZ,

  -- Config
  default_privacy TEXT DEFAULT 'public',
  default_category TEXT,
  auto_publish BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, platform, platform_account_id)
);

-- ─── Distributions ──────────────────────────────────────────────────────────
-- Published/scheduled content to platforms

CREATE TABLE public.distributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  edit_id UUID NOT NULL REFERENCES public.edits(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  thumbnail_url TEXT,

  platform TEXT NOT NULL,
  platform_post_id TEXT,
  platform_url TEXT,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'scheduled', 'publishing', 'published', 'failed', 'removed'
  )),
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,

  platform_metadata JSONB,
  analytics JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Credit Transactions ────────────────────────────────────────────────────
-- Audit log of all credit changes

CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,          -- Positive = add, negative = spend
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('render', 'purchase', 'subscription', 'refund', 'bonus')),
  reference_id TEXT,                -- Edit ID, subscription ID, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Subscriptions ──────────────────────────────────────────────────────────

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'studio')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'incomplete')),
  credits_per_month INTEGER NOT NULL DEFAULT 5,
  credits_remaining INTEGER NOT NULL DEFAULT 5,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Storage Connections ───────────────────────────────────────────────────
-- Cloud-storage integrations (Google Drive, Dropbox, iCloud, etc.)

CREATE TABLE public.storage_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'dropbox', 'icloud', 'onedrive')),
  account_email TEXT,
  account_name TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  connection_status TEXT NOT NULL DEFAULT 'connected' CHECK (connection_status IN (
    'connected', 'disconnected', 'expired', 'error'
  )),
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  storage_quota_bytes BIGINT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider, account_email)
);

-- ─── API Keys ───────────────────────────────────────────────────────────────
-- Programmatic access tokens (Studio tier)

CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,                -- First 8 chars for display: "a7sk_abc..."
  hashed_key TEXT NOT NULL,            -- bcrypt/sha256 of full key
  scopes TEXT[] NOT NULL DEFAULT '{read,write}',
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Notification Preferences ──────────────────────────────────────────────

CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_render_complete BOOLEAN NOT NULL DEFAULT TRUE,
  email_render_failed BOOLEAN NOT NULL DEFAULT TRUE,
  email_billing BOOLEAN NOT NULL DEFAULT TRUE,
  email_product_updates BOOLEAN NOT NULL DEFAULT FALSE,
  email_security_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_render_complete BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_render_failed BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_distribution_done BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX idx_edits_user_id ON public.edits(user_id);
CREATE INDEX idx_edits_status ON public.edits(status);
CREATE INDEX idx_edits_created_at ON public.edits(created_at DESC);

CREATE INDEX idx_render_jobs_edit_id ON public.render_jobs(edit_id);
CREATE INDEX idx_render_jobs_status ON public.render_jobs(status);

CREATE INDEX idx_style_dna_user_id ON public.style_dna(user_id);

CREATE INDEX idx_channels_user_id ON public.channels(user_id);
CREATE INDEX idx_channels_platform ON public.channels(platform);

CREATE INDEX idx_distributions_edit_id ON public.distributions(edit_id);
CREATE INDEX idx_distributions_channel_id ON public.distributions(channel_id);
CREATE INDEX idx_distributions_status ON public.distributions(status);

CREATE INDEX idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);

CREATE INDEX idx_storage_connections_user_id ON public.storage_connections(user_id);

CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON public.api_keys(prefix);

-- ─── Row Level Security ─────────────────────────────────────────────────────
-- Users can only access their own data

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.style_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Edits: users can CRUD their own edits
CREATE POLICY "Users can view own edits" ON public.edits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create edits" ON public.edits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own edits" ON public.edits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own edits" ON public.edits FOR DELETE USING (auth.uid() = user_id);

-- Render Jobs: users can view their own
CREATE POLICY "Users can view own render jobs" ON public.render_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create render jobs" ON public.render_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Style DNA: users can CRUD their own
CREATE POLICY "Users can view own style dna" ON public.style_dna FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create style dna" ON public.style_dna FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own style dna" ON public.style_dna FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own style dna" ON public.style_dna FOR DELETE USING (auth.uid() = user_id);

-- Channels: users can CRUD their own
CREATE POLICY "Users can view own channels" ON public.channels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create channels" ON public.channels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own channels" ON public.channels FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own channels" ON public.channels FOR DELETE USING (auth.uid() = user_id);

-- Distributions: users can CRUD their own
CREATE POLICY "Users can view own distributions" ON public.distributions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create distributions" ON public.distributions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own distributions" ON public.distributions FOR UPDATE USING (auth.uid() = user_id);

-- Credit transactions: users can view their own
CREATE POLICY "Users can view own transactions" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own transactions" ON public.credit_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Subscriptions: users can view their own
CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Storage connections: users can CRUD their own
CREATE POLICY "Users view own storage connections" ON public.storage_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own storage connections" ON public.storage_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own storage connections" ON public.storage_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own storage connections" ON public.storage_connections FOR DELETE USING (auth.uid() = user_id);

-- API keys: users can manage their own
CREATE POLICY "Users view own api keys" ON public.api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own api keys" ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own api keys" ON public.api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own api keys" ON public.api_keys FOR DELETE USING (auth.uid() = user_id);

-- Notification preferences: users can manage their own
CREATE POLICY "Users view own notification prefs" ON public.notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notification prefs" ON public.notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notification prefs" ON public.notification_preferences FOR UPDATE USING (auth.uid() = user_id);

-- ─── Triggers ───────────────────────────────────────────────────────────────

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_edits_updated_at BEFORE UPDATE ON public.edits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_style_dna_updated_at BEFORE UPDATE ON public.style_dna
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON public.channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_distributions_updated_at BEFORE UPDATE ON public.distributions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Credit Atomic Operations ──────────────────────────────────────────────
-- Atomic debit: deducts only if balance is sufficient. Returns the new
-- balance, or no rows if the balance was insufficient.
CREATE OR REPLACE FUNCTION public.debit_credit(p_user_id uuid, p_amount int)
RETURNS TABLE(credits_remaining int, credits_used_total int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
    UPDATE public.profiles
       SET credits_remaining = profiles.credits_remaining - p_amount,
           credits_used_total = profiles.credits_used_total + p_amount
     WHERE id = p_user_id
       AND profiles.credits_remaining >= p_amount
    RETURNING profiles.credits_remaining, profiles.credits_used_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_credit(p_user_id uuid, p_amount int)
RETURNS TABLE(credits_remaining int, credits_used_total int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  RETURN QUERY
    UPDATE public.profiles
       SET credits_remaining = profiles.credits_remaining + p_amount,
           credits_used_total = GREATEST(profiles.credits_used_total - p_amount, 0)
     WHERE id = p_user_id
    RETURNING profiles.credits_remaining, profiles.credits_used_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debit_credit(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credit(uuid, int) TO authenticated;
