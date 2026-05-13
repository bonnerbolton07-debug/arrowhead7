import { DashboardShell, ComingSoon } from '@/components/ui/DashboardShell';

export const metadata = { title: 'My Edits — Arrowhead 7' };

export default function MyEditsPage() {
  return (
    <DashboardShell activeHref="/dashboard/edits">
      <ComingSoon
        title="My Edits"
        blurb="A searchable history of every edit you&rsquo;ve rendered — sources, Style DNA used, output formats, and direct re-render."
        accent="teal"
        bullets={[
          'Filter by status (draft, rendering, completed, failed)',
          'Re-render any edit with a different Style DNA',
          'Download all formats from one screen',
          'Share a private review link with collaborators',
        ]}
      />
    </DashboardShell>
  );
}
