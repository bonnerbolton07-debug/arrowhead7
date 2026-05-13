import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  createServerSupabaseClient,
  getUser,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import { PlusIcon, DnaIcon } from '@/components/ui/icons';
import { StylesGrid } from './StylesGrid';
import type { StyleListRow } from './types';

export const dynamic = 'force-dynamic';

async function fetchStyles(): Promise<StyleListRow[]> {
  if (!isSupabaseConfigured()) return [];
  const user = await getUser();
  if (!user) return [];

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('style_dna')
    .select(
      'id, name, reference_video_url, cut_pattern, color_profile, pacing, status, created_at, updated_at'
    )
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  return (data ?? []).map((row): StyleListRow => {
    const cutPattern = (row.cut_pattern as Record<string, unknown>) ?? {};
    const colorProfile = (row.color_profile as Record<string, unknown>) ?? {};
    const pacing = (row.pacing as Record<string, unknown>) ?? {};
    return {
      id: row.id as string,
      name: (row.name as string) ?? 'Untitled Style',
      reference_video_url: (row.reference_video_url as string) ?? '',
      status: (row.status as StyleListRow['status']) ?? 'analyzing',
      cuts_per_minute:
        typeof cutPattern.cuts_per_minute === 'number'
          ? (cutPattern.cuts_per_minute as number)
          : null,
      avg_cut_duration_ms:
        typeof cutPattern.avg_cut_duration_ms === 'number'
          ? (cutPattern.avg_cut_duration_ms as number)
          : null,
      bpm_target:
        typeof pacing.bpm_target === 'number'
          ? (pacing.bpm_target as number)
          : null,
      energy:
        typeof pacing.overall_energy === 'string'
          ? (pacing.overall_energy as string)
          : null,
      palette: extractPalette(colorProfile),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  });
}

function extractPalette(profile: Record<string, unknown>): string[] {
  if (Array.isArray(profile.palette)) {
    return (profile.palette as unknown[])
      .filter((c): c is string => typeof c === 'string')
      .slice(0, 6);
  }
  // Synthesize a hint palette from temperature/saturation if no explicit
  // palette has been extracted yet — useful for "analyzing" state cards.
  const temp = typeof profile.temperature === 'number' ? (profile.temperature as number) : 0;
  if (temp < -20) return ['#0D5C5A', '#1A8E84', '#2DD4BF', '#5BE8D5'];
  if (temp > 20) return ['#4A2510', '#8B5A2B', '#B87333', '#D4944A'];
  return ['#2DD4BF', '#5BE8D5', '#D4944A', '#B87333'];
}

export default async function StylesPage() {
  const styles = await fetchStyles();

  return (
    <DashboardShell
      title="Style DNA"
      subtitle="Your library of editing fingerprints. Each one captures cuts, color, and pacing."
      actions={
        <a
          href="/editor"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-all text-a7-void"
          style={{
            background: 'linear-gradient(135deg, #8B5A2B, #B87333, #D4944A)',
            boxShadow: '0 0 18px rgba(184,115,51,0.25)',
          }}
        >
          <PlusIcon size={14} gradient="teal" />
          Extract New DNA
        </a>
      }
    >
      <div className="max-w-6xl">
        {styles.length === 0 ? (
          <EmptyState />
        ) : (
          <StylesGrid styles={styles} />
        )}

        <MarketplaceTeaser hasStyles={styles.length > 0} />
      </div>
    </DashboardShell>
  );
}

function EmptyState() {
  return (
    <div
      className="relative overflow-hidden rounded-lg p-16 text-center mb-8"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(245,240,232,0.04)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(184,115,51,0.15), rgba(45,212,191,0.1), transparent)',
        }}
      />
      <DnaIcon size={36} gradient="copper" className="mx-auto mb-4 opacity-50" />
      <h3 className="text-base font-semibold text-a7-text mb-1">
        No Style DNA profiles yet
      </h3>
      <p className="text-a7-text/40 text-sm mb-6 max-w-md mx-auto">
        Upload a reference video — a creator you love, a film scene, your last
        hit — and A7 will extract its editing fingerprint.
      </p>
      <a
        href="/editor"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-medium text-sm transition-all text-a7-void"
        style={{
          background: 'linear-gradient(135deg, #8B5A2B, #B87333, #D4944A)',
          boxShadow: '0 0 18px rgba(184,115,51,0.25)',
        }}
      >
        Extract your first style
      </a>
    </div>
  );
}

function MarketplaceTeaser({ hasStyles }: { hasStyles: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-6 sm:p-8 mt-8"
      style={{
        background:
          'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(184,115,51,0.04))',
        border: '1px solid rgba(245,240,232,0.06)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(45,212,191,0.25), rgba(184,115,51,0.2), transparent)',
        }}
      />
      <div className="text-[10px] uppercase tracking-wider text-a7-text/40 mb-2 font-mono">
        Coming soon
      </div>
      <h3 className="text-lg font-semibold text-a7-text mb-2">
        Style DNA Marketplace
      </h3>
      <p className="text-sm text-a7-text/50 max-w-xl">
        Soon you&rsquo;ll be able to publish your{' '}
        {hasStyles ? 'profiles' : 'best styles'} and license other
        creators&rsquo; signature edits. Sell your editing DNA, or rent the look
        of your favorite filmmaker.
      </p>
    </div>
  );
}
