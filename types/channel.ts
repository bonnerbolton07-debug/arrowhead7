// =============================================================================
// Arrowhead 7 — Channel & Distribution Types
// =============================================================================

import { UserId, EditId } from './edit';

export type ChannelId = string;
export type DistributionId = string;

/** Supported platforms for distribution */
export type Platform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'facebook'
  | 'linkedin'
  | 'custom';

/** Platform connection status */
export type ConnectionStatus = 'connected' | 'disconnected' | 'expired' | 'error';

/** A connected social/distribution channel */
export interface Channel {
  id: ChannelId;
  user_id: UserId;
  platform: Platform;
  platform_account_id: string;       // Platform-specific user/channel ID
  platform_account_name: string;     // Display name on platform
  platform_avatar_url?: string;

  // OAuth
  access_token_encrypted: string;    // Encrypted at rest
  refresh_token_encrypted?: string;
  token_expires_at?: string;
  scopes: string[];

  // Status
  connection_status: ConnectionStatus;
  last_sync_at?: string;

  // Platform-specific config
  default_privacy?: 'public' | 'unlisted' | 'private';
  default_category?: string;
  auto_publish: boolean;

  created_at: string;
  updated_at: string;
}

/** A scheduled or completed distribution to a platform */
export interface Distribution {
  id: DistributionId;
  edit_id: EditId;
  channel_id: ChannelId;
  user_id: UserId;

  // Content
  title: string;
  description: string;
  tags: string[];
  thumbnail_url?: string;

  // Platform-specific
  platform: Platform;
  platform_post_id?: string;         // ID on the platform after publishing
  platform_url?: string;             // Public URL on platform

  // Scheduling
  status: DistributionStatus;
  scheduled_for?: string;            // ISO timestamp for scheduled publish
  published_at?: string;

  // Platform-specific metadata
  platform_metadata?: Record<string, unknown>;

  // Analytics (cached from platform)
  analytics?: DistributionAnalytics;

  created_at: string;
  updated_at: string;
}

export type DistributionStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'removed';

/** Cached analytics from platform */
export interface DistributionAnalytics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_seconds?: number;
  avg_view_duration_seconds?: number;
  engagement_rate?: number;           // 0-1
  last_fetched_at: string;
}

/** User subscription tier */
export interface Subscription {
  id: string;
  user_id: UserId;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  credits_per_month: number;
  credits_remaining: number;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  stripe_price_id?: string;
  created_at: string;
  updated_at: string;
}

export type SubscriptionStatus =
  | 'active'
  | 'cancelled'
  | 'past_due'
  | 'trialing'
  | 'incomplete';

/**
 * A7 subscription tiers (locked 2026-05-13):
 *   free   — "Starter": 5 edits/mo, 720p, watermark
 *   pro    — "Pro":     50 edits/mo, 4K, strategy brain, no watermark
 *   studio — "Studio":  unlimited edits, 4K+HDR, API access, team
 */
export type SubscriptionTier = 'free' | 'pro' | 'studio';

/** Tier feature gates / limits */
export interface TierLimit {
  credits_per_month: number;     // -1 = unlimited
  max_video_duration_ms: number; // -1 = unlimited
  max_resolution: '720' | '1080' | '4k' | '4k-hdr';
  max_channels: number;          // -1 = unlimited
  style_dna_slots: number;       // -1 = unlimited
  storage_gb: number;            // -1 = unlimited
  watermark: boolean;
  priority_rendering: boolean;
  strategy_brain: boolean;
  team_collaboration: boolean;
  api_access: boolean;
  ai_generation_unlimited: boolean;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimit> = {
  free: {
    credits_per_month: 5,
    max_video_duration_ms: 60_000,
    max_resolution: '720',
    max_channels: 1,
    style_dna_slots: 1,
    storage_gb: 2,
    watermark: true,
    priority_rendering: false,
    strategy_brain: false,
    team_collaboration: false,
    api_access: false,
    ai_generation_unlimited: false,
  },
  pro: {
    credits_per_month: 50,
    max_video_duration_ms: 600_000,
    max_resolution: '4k',
    max_channels: 5,
    style_dna_slots: 25,
    storage_gb: 500,
    watermark: false,
    priority_rendering: false,
    strategy_brain: true,
    team_collaboration: false,
    api_access: false,
    ai_generation_unlimited: false,
  },
  studio: {
    credits_per_month: -1,
    max_video_duration_ms: 3_600_000,
    max_resolution: '4k-hdr',
    max_channels: -1,
    style_dna_slots: -1,
    storage_gb: 5_000,
    watermark: false,
    priority_rendering: true,
    strategy_brain: true,
    team_collaboration: true,
    api_access: true,
    ai_generation_unlimited: true,
  },
};

/** Human-readable tier display names */
export const TIER_DISPLAY: Record<SubscriptionTier, { name: string; price: number; tagline: string }> = {
  free: { name: 'Starter', price: 0, tagline: 'Try the full pipeline.' },
  pro: { name: 'Pro', price: 29, tagline: 'For weekly publishers.' },
  studio: { name: 'Studio', price: 99, tagline: 'For full-time teams.' },
};
