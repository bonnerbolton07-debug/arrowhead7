'use client';

import { useState } from 'react';
import { CrownIcon, BoltIcon } from '@/components/ui/icons';
import { TIER_DISPLAY, TIER_LIMITS, type SubscriptionTier } from '@/types';

export function SubscriptionSection({
  tier,
  status,
  currentPeriodEnd,
  creditsRemaining,
  hasStripeCustomer,
}: {
  tier: SubscriptionTier;
  status: string;
  currentPeriodEnd: string | null;
  creditsRemaining: number;
  hasStripeCustomer: boolean;
}) {
  const [busy, setBusy] = useState<'portal' | 'upgrade' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const display = TIER_DISPLAY[tier];
  const limits = TIER_LIMITS[tier];
  const isPaid = tier !== 'free';

  async function openPortal() {
    setBusy('portal');
    setError(null);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Portal unavailable');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Portal unavailable');
      setBusy(null);
    }
  }

  async function startCheckout(target: SubscriptionTier) {
    setBusy('upgrade');
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: target }),
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
    <section
      className="relative overflow-hidden rounded-lg p-6"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: isPaid
          ? '1px solid rgba(184,115,51,0.2)'
          : '1px solid rgba(245,240,232,0.05)',
        boxShadow: isPaid ? '0 0 20px rgba(184,115,51,0.06)' : 'none',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: isPaid
            ? 'linear-gradient(90deg, rgba(184,115,51,0.4), rgba(45,212,191,0.2), transparent)'
            : 'linear-gradient(90deg, rgba(45,212,191,0.25), transparent)',
        }}
      />

      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h2 className="text-base font-semibold text-a7-text mb-1 flex items-center gap-2">
            Subscription
            {isPaid && <CrownIcon size={14} gradient="copper" />}
          </h2>
          <p className="text-xs text-a7-text/40">
            Your current plan, usage, and billing.
          </p>
        </div>
        <div className="text-right">
          <div
            className={`text-lg font-bold ${
              isPaid ? 'text-grad-copper' : 'text-grad-teal'
            }`}
          >
            {display.name}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-mono text-a7-text/30">
            {status === 'active' ? 'Active' : status}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Stat
          label="Edits used"
          value={
            limits.credits_per_month === -1
              ? 'Unlimited'
              : `${Math.max(limits.credits_per_month - creditsRemaining, 0)} / ${limits.credits_per_month}`
          }
        />
        <Stat
          label="Resolution"
          value={limits.max_resolution.toUpperCase()}
        />
        <Stat
          label="Watermark"
          value={limits.watermark ? 'Yes' : 'None'}
        />
        <Stat
          label="Channels"
          value={limits.max_channels === -1 ? 'Unlimited' : String(limits.max_channels)}
        />
        <Stat
          label="Style DNA slots"
          value={
            limits.style_dna_slots === -1 ? 'Unlimited' : String(limits.style_dna_slots)
          }
        />
        <Stat
          label={isPaid ? 'Renews' : 'Plan'}
          value={
            currentPeriodEnd
              ? new Date(currentPeriodEnd).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : isPaid
              ? '—'
              : 'Free forever'
          }
        />
      </div>

      {error && (
        <p className="text-sm mb-3" style={{ color: '#E8B06A' }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {tier === 'free' ? (
          <>
            <button
              onClick={() => startCheckout('pro')}
              disabled={busy === 'upgrade'}
              className="px-5 py-2 rounded-md text-sm font-medium transition-all text-a7-void disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                boxShadow: '0 0 18px rgba(45,212,191,0.25)',
              }}
            >
              {busy === 'upgrade' ? 'Loading…' : 'Upgrade to Pro · $29/mo'}
            </button>
            <button
              onClick={() => startCheckout('studio')}
              disabled={busy === 'upgrade'}
              className="px-5 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-50"
              style={{
                background:
                  'linear-gradient(135deg, rgba(184,115,51,0.1), rgba(184,115,51,0.03))',
                border: '1px solid rgba(184,115,51,0.25)',
                color: '#D4944A',
              }}
            >
              Studio · $99/mo
            </button>
          </>
        ) : (
          <>
            <button
              onClick={openPortal}
              disabled={!hasStripeCustomer || busy === 'portal'}
              className="px-5 py-2 rounded-md text-sm font-medium transition-all text-a7-void disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                boxShadow: '0 0 16px rgba(45,212,191,0.22)',
              }}
            >
              {busy === 'portal' ? 'Loading…' : 'Manage in Stripe portal'}
            </button>
            {tier === 'pro' && (
              <button
                onClick={() => startCheckout('studio')}
                disabled={busy === 'upgrade'}
                className="px-5 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-50"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(184,115,51,0.1), rgba(184,115,51,0.03))',
                  border: '1px solid rgba(184,115,51,0.25)',
                  color: '#D4944A',
                }}
              >
                Upgrade to Studio
              </button>
            )}
          </>
        )}
        <a
          href="/pricing"
          className="text-xs text-a7-text/50 hover:text-a7-text inline-flex items-center gap-1"
        >
          <BoltIcon size={12} gradient="teal" />
          Compare plans →
        </a>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md px-3 py-2"
      style={{ background: '#0C0C0A', border: '1px solid rgba(245,240,232,0.04)' }}
    >
      <div className="text-[10px] uppercase tracking-wider text-a7-text/30 font-mono mb-0.5">
        {label}
      </div>
      <div className="text-sm font-medium text-a7-text truncate">{value}</div>
    </div>
  );
}
