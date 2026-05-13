import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { EditsTable } from './EditsTable';
import {
  createServerSupabaseClient,
  getUser,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import { PlusIcon } from '@/components/ui/icons';
import type { EditListRow } from './types';

export const dynamic = 'force-dynamic';

async function fetchEdits(): Promise<EditListRow[]> {
  if (!isSupabaseConfigured()) return [];
  const user = await getUser();
  if (!user) return [];

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('edits')
    .select(
      'id, title, status, output_thumbnail_url, output_video_url, source_video_url, created_at, updated_at, completed_at, style_dna_id, style_dna:style_dna_id(id, name)'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  return (data ?? []).map((row): EditListRow => {
    const styleDnaRaw = (row as { style_dna?: unknown }).style_dna;
    let styleName: string | null = null;
    if (Array.isArray(styleDnaRaw)) {
      const first = styleDnaRaw[0] as { name?: string } | undefined;
      styleName = first?.name ?? null;
    } else if (styleDnaRaw && typeof styleDnaRaw === 'object') {
      styleName = (styleDnaRaw as { name?: string }).name ?? null;
    }
    return {
      id: row.id as string,
      title: (row.title as string) ?? 'Untitled Edit',
      status: row.status as EditListRow['status'],
      output_thumbnail_url: (row.output_thumbnail_url as string | null) ?? null,
      output_video_url: (row.output_video_url as string | null) ?? null,
      source_video_url: (row.source_video_url as string | null) ?? null,
      style_dna_id: (row.style_dna_id as string | null) ?? null,
      style_dna_name: styleName,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      completed_at: (row.completed_at as string | null) ?? null,
    };
  });
}

export default async function EditsPage() {
  const edits = await fetchEdits();
  const supabaseReady = isSupabaseConfigured();

  return (
    <DashboardShell
      title="My Edits"
      subtitle="Every edit you've started, in progress, or completed."
      actions={
        <a
          href="/editor"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-all text-a7-void"
          style={{
            background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
            boxShadow: '0 0 18px rgba(45,212,191,0.25)',
          }}
        >
          <PlusIcon size={14} gradient="copper" />
          New Edit
        </a>
      }
    >
      <div className="max-w-6xl">
        {!supabaseReady && (
          <div
            className="mb-6 px-4 py-3 rounded-md text-sm"
            style={{
              background:
                'linear-gradient(135deg, rgba(212,148,74,0.08), rgba(212,148,74,0.02))',
              border: '1px solid rgba(212,148,74,0.25)',
              color: '#E8B06A',
            }}
          >
            Supabase isn&rsquo;t configured. Your edit history will appear here once it&rsquo;s set up.
          </div>
        )}

        <EditsTable edits={edits} />
      </div>
    </DashboardShell>
  );
}
