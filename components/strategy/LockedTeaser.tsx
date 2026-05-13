// =============================================================================
// Arrowhead 7 — Strategy Brain UI: Locked Teaser
// =============================================================================
// Shown to free/creator users who haven't unlocked Strategy Brain.

import { LockIcon, CompassIcon, ArrowRightIcon } from '@/components/ui/icons';

interface LockedTeaserProps {
  tier?: string;
}

const BULLETS = [
  {
    title: 'Next Best Content',
    body: 'AI tells you exactly what to make next — topic, hook, audio, hashtags.',
  },
  {
    title: 'Algorithm-aware calendar',
    body: 'Posting slots tuned to your audience’s actual behavior.',
  },
  {
    title: 'Live trend signals',
    body: 'Trending audio, hashtags, and formats per platform — refreshed daily.',
  },
  {
    title: 'Hook engineering library',
    body: '15+ scroll-stopping opening patterns categorized by niche and platform.',
  },
  {
    title: 'Performance autopsy',
    body: 'Which topics, formats, and hooks moved the needle — and which didn’t.',
  },
];

export function LockedTeaser({ tier }: LockedTeaserProps) {
  return (
    <div className="max-w-3xl mx-auto">
      <div
        className="relative overflow-hidden rounded-xl p-8 md:p-10"
        style={{
          background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
          border: '1px solid rgba(184,115,51,0.18)',
          boxShadow: '0 0 30px rgba(184,115,51,0.08)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(45,212,191,0.3), rgba(184,115,51,0.25), transparent)',
          }}
        />

        <div className="flex items-start gap-4 mb-6">
          <div
            className="rounded-md p-3"
            style={{
              background: 'linear-gradient(135deg, rgba(184,115,51,0.08), rgba(184,115,51,0.02))',
              border: '1px solid rgba(184,115,51,0.15)',
            }}
          >
            <LockIcon size={24} gradient="copper" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CompassIcon size={20} gradient="dual" />
              <h2 className="text-2xl font-bold text-a7-text">Strategy Brain</h2>
              <span className="text-xs uppercase tracking-wider text-grad-copper">Pro</span>
            </div>
            <p className="text-a7-text/60 text-sm leading-relaxed max-w-xl">
              A7 isn&rsquo;t just an editor — it&rsquo;s a copilot. Strategy Brain
              tells you what to make, when to post, and why. It gets smarter with
              every edit you ship.
            </p>
          </div>
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {BULLETS.map((b) => (
            <li
              key={b.title}
              className="rounded-md p-3"
              style={{
                background: 'linear-gradient(135deg, rgba(45,212,191,0.03), rgba(45,212,191,0.01))',
                border: '1px solid rgba(45,212,191,0.08)',
              }}
            >
              <div className="text-sm font-medium text-grad-teal mb-1">{b.title}</div>
              <div className="text-xs text-a7-text/50 leading-relaxed">{b.body}</div>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-a7-text/40">
            {tier ? (
              <>
                You&rsquo;re on the{' '}
                <span className="text-a7-text/70 capitalize">{tier}</span> plan.
              </>
            ) : (
              <>Strategy Brain is available on Pro and Enterprise plans.</>
            )}
          </div>
          <a
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-a7-void px-4 py-2.5 rounded-md transition-all"
            style={{
              background: 'linear-gradient(135deg, #2DD4BF, #B87333)',
              boxShadow:
                '0 0 20px rgba(45,212,191,0.2), 0 0 20px rgba(184,115,51,0.2)',
            }}
          >
            Upgrade to Pro
            <ArrowRightIcon size={14} gradient="copper" />
          </a>
        </div>
      </div>
    </div>
  );
}
