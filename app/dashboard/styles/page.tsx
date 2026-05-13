import { DashboardShell, ComingSoon } from '@/components/ui/DashboardShell';

export const metadata = { title: 'Style DNA — Arrowhead 7' };

export default function StylesPage() {
  return (
    <DashboardShell activeHref="/dashboard/styles">
      <ComingSoon
        title="Style DNA Library"
        blurb="Your saved Style DNA profiles — the editing fingerprints extracted from your favorite reference videos. Reuse them across every edit."
        accent="copper"
        bullets={[
          'Save unlimited Style DNA profiles (Pro tier)',
          'Blend multiple references into a composite style',
          'Side-by-side compare two profiles (rhythm, color, pacing)',
          'One-tap apply to any source footage',
        ]}
      />
    </DashboardShell>
  );
}
