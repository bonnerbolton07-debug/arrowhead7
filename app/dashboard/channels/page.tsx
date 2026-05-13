import { DashboardShell, ComingSoon } from '@/components/ui/DashboardShell';

export const metadata = { title: 'Channels — Arrowhead 7' };

export default function ChannelsPage() {
  return (
    <DashboardShell activeHref="/dashboard/channels">
      <ComingSoon
        title="Channels"
        blurb="Connect your distribution platforms — YouTube, TikTok, Instagram, X, LinkedIn, Facebook — and publish renders directly from Arrowhead 7."
        accent="teal"
        bullets={[
          'OAuth flows for YouTube, TikTok, Instagram, X, LinkedIn',
          'Per-platform default privacy, category, and tags',
          'Schedule posts across channels from one screen',
          'Pull back published-post analytics (views, engagement)',
        ]}
      />
    </DashboardShell>
  );
}
