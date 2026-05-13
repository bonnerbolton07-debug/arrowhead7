// =============================================================================
// Arrowhead 7 — Stripe Webhook Handler
// =============================================================================
// POST /api/stripe/webhooks
//
// Handles:
//   - checkout.session.completed       → activate the new subscription
//   - customer.subscription.updated    → keep tier/status in sync
//   - customer.subscription.deleted    → downgrade to free
//   - invoice.payment_failed           → mark subscription past_due
//
// Verifies the signature against STRIPE_WEBHOOK_SECRET. Uses the service-role
// Supabase client because webhook requests aren't authenticated as a user.

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { tierFromStripePriceId, PRICING_TIERS } from '@/lib/stripe/pricing';
import { TIER_LIMITS, type SubscriptionTier } from '@/types';
import { getAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
// Raw body is required to verify the signature — Next 13/14 route handlers
// give us the body via .text() before any parsing.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isStripeConfigured() || !isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Billing/admin not configured.' },
      { status: 503 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET not set.' },
      { status: 503 }
    );
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpserted(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // Acknowledge but don't act — keeps the dashboard clean.
        break;
    }
  } catch (err) {
    console.error(`Stripe webhook handler failed for ${event.type}:`, err);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

// ─── Handlers ─────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') return;

  const userId = session.metadata?.supabase_user_id;
  if (!userId) {
    console.warn('checkout.session.completed missing supabase_user_id metadata');
    return;
  }

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;

  if (!subscriptionId) return;

  const sub = await getStripe().subscriptions.retrieve(subscriptionId);
  await applySubscriptionState(userId, sub);
}

async function handleSubscriptionUpserted(subscription: Stripe.Subscription) {
  const userId = await resolveUserId(subscription);
  if (!userId) return;
  await applySubscriptionState(userId, subscription);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = await resolveUserId(subscription);
  if (!userId) return;

  const admin = getAdminClient();
  await admin
    .from('profiles')
    .update({
      subscription_tier: 'free',
      subscription_status: 'cancelled',
      stripe_subscription_id: null,
      current_period_end: null,
      credits_remaining: TIER_LIMITS.free.credits_per_month,
    })
    .eq('id', userId);

  await admin
    .from('subscriptions')
    .update({
      tier: 'free',
      status: 'cancelled',
      cancel_at_period_end: false,
    })
    .eq('stripe_subscription_id', subscription.id);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id;
  if (!subscriptionId) return;

  const sub = await getStripe().subscriptions.retrieve(subscriptionId);
  const userId = await resolveUserId(sub);
  if (!userId) return;

  const admin = getAdminClient();
  await admin
    .from('profiles')
    .update({ subscription_status: 'past_due' })
    .eq('id', userId);
  await admin
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Apply a Stripe subscription's state to our profiles + subscriptions tables.
 * Authoritative for: tier, status, period end, credits allotment.
 */
async function applySubscriptionState(
  userId: string,
  sub: Stripe.Subscription
) {
  const admin = getAdminClient();
  const priceId = sub.items.data[0]?.price.id;
  const tier: SubscriptionTier =
    (priceId ? tierFromStripePriceId(priceId) : null) ??
    (sub.metadata?.tier as SubscriptionTier | undefined) ??
    'free';

  const status = mapStripeStatus(sub.status);
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
  const periodStart = new Date(sub.current_period_start * 1000).toISOString();
  const allotment = TIER_LIMITS[tier].credits_per_month;
  // Unlimited tier: signal in-app with a sentinel high number.
  const credits = allotment === -1 ? 999_999 : allotment;

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  await admin
    .from('profiles')
    .update({
      subscription_tier: tier,
      subscription_status: status,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd,
      credits_remaining: credits,
    })
    .eq('id', userId);

  await admin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        tier,
        status,
        credits_per_month: allotment === -1 ? 999_999 : allotment,
        credits_remaining: credits,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        stripe_subscription_id: sub.id,
        stripe_customer_id: customerId,
        stripe_price_id: priceId ?? null,
      },
      { onConflict: 'stripe_subscription_id' }
    );
}

function mapStripeStatus(status: Stripe.Subscription.Status):
  | 'active'
  | 'cancelled'
  | 'past_due'
  | 'trialing'
  | 'incomplete' {
  switch (status) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due': return 'past_due';
    case 'unpaid': return 'past_due';
    case 'canceled': return 'cancelled';
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
    default: return 'incomplete';
  }
}

/** Find our user ID by looking up the Stripe customer ID. */
async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  // Prefer metadata when available (set at checkout).
  const metaUserId = sub.metadata?.supabase_user_id;
  if (metaUserId) return metaUserId;

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const admin = getAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  return data?.id ?? null;
}

// Force the bundler to keep this import — TS won't warn but it makes the
// dependency on pricing tiers explicit (we read them via tierFromStripePriceId).
void PRICING_TIERS;
