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
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  credits_per_month: number;
  credits_remaining: number;
  current_period_start: string;
  current_period_end: string;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  created_at: string;
  updated_at: string;
}

export type SubscriptionTier = 'free' | 'creator' | 'pro' | 'enterprise';

/** Tier limits */
export const TIER_LIMITS: Record<SubscriptionTier, {
  credits_per_month: number;
  max_video_duration_ms: number;
  max_resolution: string;
  max_channels: number;
  style_dna_slots: number;
  priority_rendering: boolean;
}> = {
  free: {
    credits_per_month: 3,
    max_video_duration_ms: 60_000,
    max_resolution: 'hd',
    max_channels: 1,
    style_dna_slots: 1,
    priority_rendering: false,
  },
  creator: {
    credits_per_month: 25,
    max_video_duration_ms: 300_000,
    max_resolution: '1080',
    max_channels: 3,
    style_dna_slots: 5,
    priority_rendering: false,
  },
  pro: {
    credits_per_month: 100,
    max_video_duration_ms: 900_000,
    max_resolution: '4k',
    max_channels: 10,
    style_dna_slots: 20,
    priority_rendering: true,
  },
  enterprise: {
    credits_per_month: -1,           // Unlimited
    max_video_duration_ms: 3_600_000,
    max_resolution: '4k',
    max_channels: -1,
    style_dna_slots: -1,
    priority_rendering: true,
  },
};
