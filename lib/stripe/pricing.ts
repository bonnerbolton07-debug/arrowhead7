// =============================================================================
// Arrowhead 7 — Pricing Configuration
// =============================================================================
// Single source of truth for tier features displayed on the marketing site,
// pricing page, settings page, and used for in-app feature gating.

import type { SubscriptionTier } from '@/types';

export interface PricingTier {
  id: SubscriptionTier;
  name: string;
  price: number;                // USD per month
  priceLabel: string;           // "$29"
  cadence: string;              // "/month", "forever"
  tagline: string;
  description: string;
  features: string[];
  highlights: string[];         // Short feature highlights for cards
  cta: string;
  accent: 'teal' | 'copper' | 'dual';
  popular: boolean;
  // Stripe price ID — populated from env on the server, used for checkout.
  stripePriceEnvVar?: string;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Starter',
    price: 0,
    priceLabel: '$0',
    cadence: 'forever',
    tagline: 'Try the full pipeline.',
    description: 'Get a feel for autonomous editing before you commit.',
    features: [
      '5 AI edits / month',
      '720p exports',
      'Made-with-A7 watermark',
      '1 Style DNA profile',
      'Community support',
    ],
    highlights: ['5 edits/mo', '720p', 'Watermark'],
    cta: 'Start free',
    accent: 'teal',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29,
    priceLabel: '$29',
    cadence: '/month',
    tagline: 'For weekly publishers.',
    description: 'Everything a working creator needs to publish on cadence.',
    features: [
      '50 AI edits / month',
      '4K exports, no watermark',
      'Strategy brain (auto thumbnail, title, hook)',
      '5 connected social accounts',
      '25 Style DNA profiles',
      '500 GB Smart Vault',
      'Email support',
    ],
    highlights: ['50 edits/mo', '4K', 'Strategy Brain', '5 channels'],
    cta: 'Go Pro',
    accent: 'dual',
    popular: true,
    stripePriceEnvVar: 'STRIPE_PRICE_PRO_MONTHLY',
  },
  {
    id: 'studio',
    name: 'Studio',
    price: 99,
    priceLabel: '$99',
    cadence: '/month',
    tagline: 'For full-time teams.',
    description: 'Unlimited rendering, team workflows, programmatic access.',
    features: [
      'Unlimited AI edits',
      '4K + HDR export',
      'Unlimited AI generation',
      'All social channels',
      'Priority cloud rendering',
      'Team collaboration (up to 5 seats)',
      'API access',
      '5 TB Smart Vault',
      'Priority support',
    ],
    highlights: ['Unlimited', '4K+HDR', 'API', 'Team'],
    cta: 'Go Studio',
    accent: 'copper',
    popular: false,
    stripePriceEnvVar: 'STRIPE_PRICE_STUDIO_MONTHLY',
  },
];

export function getTier(id: SubscriptionTier): PricingTier {
  const tier = PRICING_TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown tier: ${id}`);
  return tier;
}

export function getStripePriceId(tier: SubscriptionTier): string | null {
  const t = getTier(tier);
  if (!t.stripePriceEnvVar) return null;
  return process.env[t.stripePriceEnvVar] ?? null;
}

/** Map a Stripe price ID back to our tier (used in webhooks). */
export function tierFromStripePriceId(priceId: string): SubscriptionTier | null {
  for (const t of PRICING_TIERS) {
    if (!t.stripePriceEnvVar) continue;
    if (process.env[t.stripePriceEnvVar] === priceId) return t.id;
  }
  return null;
}
