// =============================================================================
// Arrowhead 7 — Stripe Server Client
// =============================================================================
// Lazy singleton — Stripe SDK only initialized when first accessed so build
// time / route handlers that don't touch billing don't blow up when keys are
// missing in dev.

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
  }
  _stripe = new Stripe(key, {
    apiVersion: '2023-10-16',
    typescript: true,
    appInfo: {
      name: 'Arrowhead 7',
      version: '0.1.0',
    },
  });
  return _stripe;
}
