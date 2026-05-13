import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { getUser, createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { PlusIcon, DnaIcon, FilmIcon, BoltIcon } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

interface RecentEdit {
  id: string;
  title: string;
  status: string;
  output_thumbnail_url: string | null;
  created_at: string;
}

async function getRecentEdits(userId: string): Promise<RecentEdit[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('edits')
      .select('id, title, status, output_thumbnail_url, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(6);
    return (data ?? []) as RecentEdit[];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const user = await getUser();
  const supabaseReady = isSupabaseConfigured();
  const recents = user ? await getRecentEdits(user.id) : [];

  return (
    <DashboardShell
      title="Dashboard"
      subtitle={
        user
          ? `Welcome back, ${user.email ?? 'creator'}. Start a new edit or continue where you left off.`
          : 'Welcome. Start a new edit or continue where you left off.'
      }
    >
      <div className="max-w-6xl">
        {!supabaseReady && (
          <div
            className="mb-8 px-4 py-3 rounded-md text-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(212,148,74,0.08), rgba(212,148,74,0.02))',
              border: '1px solid rgba(212,148,74,0.25)',
              color: '#E8B06A',
            }}
          >
            Supabase is not configured yet. Sign-in, history, and rendering won&rsquo;t persist until{' '}
            <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are set.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          <QuickAction
            href="/editor"
            title="New Edit"
            desc="Upload footage and create an autonomous edit"
            Icon={PlusIcon}
            accent="teal"
          />
          <QuickAction
            href="/dashboard/styles"
            title="New Style DNA"
            desc="Extract editing fingerprint from a reference"
            Icon={DnaIcon}
            accent="copper"
          />
          <QuickAction
            href="/dashboard/edits"
            title="All Edits"
            desc="Browse your full library"
            Icon={FilmIcon}
            accent="teal"
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-a7-text">Recent Edits</h2>
          <a href="/dashboard/edits" className="text-xs text-grad-teal hover:underline">
            View all →
          </a>
        </div>

        {recents.length === 0 ? (
          <EmptyRecent />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {recents.map((e) => (
              <RecentCard key={e.id} edit={e} />
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function QuickAction({
  href,
  title,
  desc,
  Icon,
  accent,
}: {
  href: string;
  title: string;
  desc: string;
  Icon: typeof PlusIcon;
  accent: 'teal' | 'copper';
}) {
  const teal = accent === 'teal';
  return (
    <a
      href={href}
      className="relative overflow-hidden rounded-lg p-6 transition-all group hover:scale-[1.01]"
      style={{
        background: teal
          ? 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))'
          : 'linear-gradient(135deg, rgba(184,115,51,0.04), rgba(184,115,51,0.01))',
        border: teal
          ? '1px solid rgba(45,212,191,0.08)'
          : '1px solid rgba(184,115,51,0.08)',
        boxShadow: teal
          ? '0 0 15px rgba(45,212,191,0.05)'
          : '0 0 15px rgba(184,115,51,0.05)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: teal
            ? 'linear-gradient(90deg, rgba(45,212,191,0.25), transparent)'
            : 'linear-gradient(90deg, rgba(184,115,51,0.25), transparent)',
        }}
      />
      <Icon size={28} gradient={accent} className="mb-3" />
      <h3
        className={`font-semibold mb-1 text-a7-text transition-all ${
          teal ? 'group-hover:text-grad-teal' : 'group-hover:text-grad-copper'
        }`}
      >
        {title}
      </h3>
      <p className="text-sm text-a7-text/30">{desc}</p>
    </a>
  );
}

function EmptyRecent() {
  return (
    <div
      className="relative overflow-hidden rounded-lg p-12 text-center mb-12"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(245,240,232,0.04)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(45,212,191,0.1), rgba(184,115,51,0.08), transparent)',
        }}
      />
      <BoltIcon size={28} gradient="teal" className="mx-auto mb-3 opacity-50" />
      <p className="text-a7-text/30 text-sm">No edits yet. Create your first one above.</p>
    </div>
  );
}

function RecentCard({ edit }: { edit: RecentEdit }) {
  const statusColor =
    edit.status === 'completed'
      ? '#2DD4BF'
      : edit.status === 'failed'
      ? '#EF4444'
      : '#D4944A';

  return (
    <a
      href={`/editor?id=${edit.id}`}
      className="relative overflow-hidden rounded-lg transition-all hover:scale-[1.01] block"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(245,240,232,0.05)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(45,212,191,0.2), transparent)',
        }}
      />
      <div
        className="aspect-video flex items-center justify-center relative"
        style={{
          background: edit.output_thumbnail_url
            ? `url(${edit.output_thumbnail_url}) center/cover`
            : 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(184,115,51,0.04))',
        }}
      >
        {!edit.output_thumbnail_url && (
          <FilmIcon size={32} gradient="teal" className="opacity-40" />
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-medium text-sm text-a7-text truncate">{edit.title}</h4>
          <span
            className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full ml-2 shrink-0"
            style={{
              background: `${statusColor}14`,
              color: statusColor,
              border: `1px solid ${statusColor}33`,
            }}
          >
            {edit.status}
          </span>
        </div>
        <p className="text-xs text-a7-text/30">
          {new Date(edit.created_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
    </a>
  );
}
