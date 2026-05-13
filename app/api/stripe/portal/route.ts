// =============================================================================
// Arrowhead 7 — Stripe Customer Portal API
// =============================================================================
// POST /api/stripe/portal
// Returns: { url } — redirect the user here to manage subscription/billing.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { getOrCreateCustomerId } from '@/lib/stripe/customer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Billing is not configured. Contact support.' },
        { status: 503 }
      );
    }

    const user = await requireUser();
    const customerId = await getOrCreateCustomerId(user);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

    const portal = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/dashboard/settings`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Stripe portal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
