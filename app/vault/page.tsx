import { DashboardShell, ComingSoon } from '@/components/ui/DashboardShell';

export const metadata = { title: 'Smart Vault — Arrowhead 7' };

export default function VaultPage() {
  return (
    <DashboardShell activeHref="/vault">
      <ComingSoon
        title="Smart Vault"
        blurb="Every clip you&rsquo;ve uploaded — auto-tagged by scene, subject, motion, energy, and color. Search semantically, drag straight into the editor."
        accent="copper"
        bullets={[
          'Visual + semantic search (&ldquo;sunset wide shots with people walking&rdquo;)',
          'Auto-tags for scene, mood, motion, color, and faces',
          'Group clips by Style DNA compatibility',
          'Drag clips straight into the editor timeline',
        ]}
      />
    </DashboardShell>
  );
}
