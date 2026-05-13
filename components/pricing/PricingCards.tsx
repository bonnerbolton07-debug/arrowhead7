'use client';

import { useState } from 'react';
import { CheckIcon } from '@/components/ui/icons';
import { PRICING_TIERS, type PricingTier } from '@/lib/stripe/pricing';
import type { SubscriptionTier } from '@/types';

interface Props {
  /** Current user's tier — when set, the matching card shows "Current plan". */
  currentTier?: SubscriptionTier;
  /** Whether the viewer is signed in. Free tier sends new users to signup. */
  signedIn?: boolean;
}

export function PricingCards({ currentTier, signedIn = false }: Props) {
  const [busy, setBusy] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(tier: PricingTier) {
    setError(null);

    if (!signedIn) {
      window.location.href = `/auth/signup?next=${encodeURIComponent(
        `/pricing?upgrade=${tier.id}`
      )}`;
      return;
    }

    if (tier.id === 'free') {
      window.location.href = '/dashboard';
      return;
    }

    setBusy(tier.id);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tier.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Checkout unavailable');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout unavailable');
      setBusy(null);
    }
  }

  return (
    <>
      {error && (
        <div
          className="mb-4 px-4 py-3 rounded-md text-sm max-w-2xl mx-auto"
          style={{
            background:
              'linear-gradient(135deg, rgba(212,148,74,0.08), rgba(212,148,74,0.02))',
            border: '1px solid rgba(212,148,74,0.25)',
            color: '#E8B06A',
          }}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 max-w-6xl mx-auto">
        {PRICING_TIERS.map((t) => {
          const isCurrent = currentTier === t.id;
          return (
            <div
              key={t.id}
              className="relative overflow-hidden rounded-2xl p-6 sm:p-7 flex flex-col"
              style={{
                background:
                  t.accent === 'teal'
                    ? 'linear-gradient(180deg, rgba(13,92,90,0.18), rgba(16,16,14,0.6))'
                    : t.accent === 'copper'
                    ? 'linear-gradient(180deg, rgba(74,37,16,0.18), rgba(16,16,14,0.6))'
                    : 'linear-gradient(180deg, rgba(45,212,191,0.12), rgba(184,115,51,0.08), rgba(16,16,14,0.6))',
                border: t.popular
                  ? '1px solid rgba(45,212,191,0.3)'
                  : '1px solid rgba(245,240,232,0.06)',
                boxShadow: t.popular
                  ? '0 0 30px rgba(45,212,191,0.12), 0 0 60px rgba(184,115,51,0.06)'
                  : 'none',
              }}
            >
              {t.popular && (
                <div
                  className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-mono text-a7-void"
                  style={{
                    background: 'linear-gradient(135deg, #2DD4BF, #B87333)',
                  }}
                >
                  POPULAR
                </div>
              )}
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background:
                    t.accent === 'teal'
                      ? 'linear-gradient(90deg, rgba(45,212,191,0.4), transparent)'
                      : t.accent === 'copper'
                      ? 'linear-gradient(90deg, rgba(184,115,51,0.4), transparent)'
                      : 'linear-gradient(90deg, rgba(45,212,191,0.4), rgba(184,115,51,0.3), transparent)',
                }}
              />
              <div className="text-sm font-semibold text-a7-text/80 mb-1">{t.name}</div>
              <div className="text-xs text-a7-text/40 mb-5">{t.tagline}</div>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-bold text-a7-text">{t.priceLabel}</span>
                <span className="text-sm text-a7-text/40">{t.cadence}</span>
              </div>

              <ul className="space-y-2.5 mb-7 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-a7-text/70">
                    <span className="mt-0.5 shrink-0">
                      <CheckIcon
                        size={14}
                        gradient={t.accent === 'copper' ? 'copper' : 'teal'}
                      />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => startCheckout(t)}
                disabled={isCurrent || busy === t.id}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md font-semibold text-sm transition-all disabled:cursor-not-allowed"
                style={
                  isCurrent
                    ? {
                        background:
                          'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
                        border: '1px solid rgba(245,240,232,0.08)',
                        color: 'rgba(245,240,232,0.5)',
                      }
                    : t.popular
                    ? {
                        background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                        color: '#0A0A0A',
                        boxShadow: '0 0 20px rgba(45,212,191,0.3)',
                      }
                    : t.accent === 'copper'
                    ? {
                        background:
                          'linear-gradient(135deg, rgba(184,115,51,0.1), rgba(184,115,51,0.03))',
                        border: '1px solid rgba(184,115,51,0.25)',
                        color: '#D4944A',
                      }
                    : {
                        background:
                          'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
                        border: '1px solid rgba(45,212,191,0.2)',
                        color: '#5BE8D5',
                      }
                }
              >
                {isCurrent
                  ? 'Current plan'
                  : busy === t.id
                  ? 'Loading…'
                  : t.cta}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
