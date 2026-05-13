// =============================================================================
// Arrowhead 7 — Stripe Checkout API
// =============================================================================
// POST /api/stripe/checkout
// Body: { tier: 'pro' | 'studio' }
// Returns: { url } — the Stripe Checkout URL the client should redirect to.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { getStripePriceId } from '@/lib/stripe/pricing';
import { getOrCreateCustomerId } from '@/lib/stripe/customer';
import type { SubscriptionTier } from '@/types';

export const dynamic = 'force-dynamic';

const PAID_TIERS: SubscriptionTier[] = ['pro', 'studio'];

export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Billing is not configured. Contact support.' },
        { status: 503 }
      );
    }

    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const tier = body?.tier as SubscriptionTier | undefined;

    if (!tier || !PAID_TIERS.includes(tier)) {
      return NextResponse.json(
        { error: 'Invalid tier. Must be one of: pro, studio.' },
        { status: 400 }
      );
    }

    const priceId = getStripePriceId(tier);
    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price not configured for tier: ${tier}` },
        { status: 503 }
      );
    }

    const customerId = await getOrCreateCustomerId(user);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl}/dashboard/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing?checkout=cancelled`,
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          tier,
        },
      },
      metadata: {
        supabase_user_id: user.id,
        tier,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
