// =============================================================================
// Arrowhead 7 — Channels (Connected Publishing Platforms)
// =============================================================================

import { Logo } from '@/components/ui/Logo';
import { getUser, isSupabaseConfigured, createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const PLATFORMS: {
  id: 'youtube' | 'tiktok' | 'instagram' | 'twitter';
  name: string;
  description: string;
  envCheck: string[];
  accent: 'teal' | 'copper';
}[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Upload finished edits as videos or shorts with title, description, tags.',
    envCheck: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    accent: 'teal',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    description: 'Direct post via Content Posting API with privacy + interaction controls.',
    envCheck: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    accent: 'copper',
  },
  {
    id: 'instagram',
    name: 'Instagram Reels',
    description: 'Publish Reels via the Graph API. Requires an IG business account.',
    envCheck: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
    accent: 'teal',
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    description: 'Post video tweets with text and hashtags.',
    envCheck: ['X_CLIENT_ID'],
    accent: 'copper',
  },
];

const STORAGE = [
  {
    id: 'google-drive',
    dbProvider: 'google_drive' as const,
    name: 'Google Drive',
    description: 'Import source footage from Drive into the Smart Vault.',
    envCheck: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    accent: 'teal' as const,
  },
  {
    id: 'dropbox',
    dbProvider: 'dropbox' as const,
    name: 'Dropbox',
    description: 'Browse and import video files from Dropbox.',
    envCheck: ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET'],
    accent: 'copper' as const,
  },
];

interface SearchParams {
  connected?: string;
  error?: string;
}

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect('/auth/login?next=/dashboard/channels');

  const supabaseReady = isSupabaseConfigured();
  let connectedChannels: Array<{
    id: string;
    platform: string;
    platform_account_name: string;
    connection_status: string;
  }> = [];
  let connectedClouds: Array<{
    id: string;
    provider: string;
    account_name: string | null;
    account_email: string | null;
    connection_status: string;
  }> = [];

  if (supabaseReady) {
    const supabase = await createServerSupabaseClient();
    const [{ data: channels }, { data: clouds }] = await Promise.all([
      supabase
        .from('channels')
        .select('id, platform, platform_account_name, connection_status')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('cloud_connections')
        .select('id, provider, account_name, account_email, connection_status')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false }),
    ]);
    connectedChannels = channels ?? [];
    connectedClouds = clouds ?? [];
  }

  const channelByPlatform = new Map(
    connectedChannels.map((c) => [c.platform, c])
  );
  const cloudByProvider = new Map(
    connectedClouds.map((c) => [c.provider, c])
  );

  function envSet(keys: string[]): boolean {
    return keys.every((k) => Boolean(process.env[k]));
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void">
      <header className="border-b border-a7-text/[0.04] px-6 py-5 flex items-center gap-3">
        <a href="/dashboard" className="flex items-center gap-2">
          <Logo variant="dual" size="sm" wordmark />
        </a>
        <span className="text-a7-text/30 text-sm ml-3">/ Channels</span>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-2 text-a7-text">Channels</h1>
        <p className="text-a7-text/40 text-sm mb-8">
          Connect publishing platforms and cloud storage. Tokens are encrypted at
          rest using AES-256-GCM.
        </p>

        {sp.connected && (
          <div
            className="mb-6 px-4 py-3 rounded-md text-sm"
            style={{
              background:
                'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
              border: '1px solid rgba(45,212,191,0.25)',
              color: '#5BE8D5',
            }}
          >
            Connected {sp.connected.replace('_', ' ')} successfully.
          </div>
        )}
        {sp.error && (
          <div
            className="mb-6 px-4 py-3 rounded-md text-sm"
            style={{
              background:
                'linear-gradient(135deg, rgba(212,148,74,0.08), rgba(212,148,74,0.02))',
              border: '1px solid rgba(212,148,74,0.25)',
              color: '#E8B06A',
            }}
          >
            Connection failed: {sp.error}
          </div>
        )}

        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-4 text-a7-text">
            Publishing Platforms
          </h2>
          <div className="space-y-3">
            {PLATFORMS.map((p) => {
              const connected = channelByPlatform.get(p.id);
              const ready = envSet(p.envCheck);
              const accentRgb =
                p.accent === 'teal' ? '45,212,191' : '184,115,51';
              return (
                <div
                  key={p.id}
                  className="relative overflow-hidden rounded-lg p-5 flex items-start gap-4"
                  style={{
                    background:
                      'linear-gradient(180deg, #10100E, #0C0C0A)',
                    border: `1px solid rgba(${accentRgb},0.08)`,
                  }}
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{
                      background: `linear-gradient(90deg, rgba(${accentRgb},0.25), transparent)`,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3
                        className={`font-semibold ${
                          p.accent === 'teal'
                            ? 'text-grad-teal'
                            : 'text-grad-copper'
                        }`}
                      >
                        {p.name}
                      </h3>
                      {connected && (
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            background: 'rgba(45,212,191,0.1)',
                            color: '#5BE8D5',
                          }}
                        >
                          {connected.platform_account_name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-a7-text/40">{p.description}</p>
                    {!ready && (
                      <p className="text-xs text-a7-text/30 mt-2">
                        Set {p.envCheck.join(' + ')} in environment to enable.
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {connected ? (
                      <a
                        href={`/api/auth/${
                          p.id === 'twitter' ? 'x' : p.id
                        }/connect`}
                        className="text-xs px-3 py-2 rounded-md border border-a7-text/[0.08] text-a7-text/60 hover:text-a7-text"
                      >
                        Reconnect
                      </a>
                    ) : (
                      <a
                        href={
                          ready
                            ? `/api/auth/${
                                p.id === 'twitter' ? 'x' : p.id
                              }/connect`
                            : '#'
                        }
                        aria-disabled={!ready}
                        className={`text-xs px-4 py-2 rounded-md font-medium transition-all ${
                          ready
                            ? 'hover:scale-[1.02]'
                            : 'opacity-40 cursor-not-allowed'
                        }`}
                        style={{
                          background:
                            p.accent === 'teal'
                              ? 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.05))'
                              : 'linear-gradient(135deg, rgba(184,115,51,0.15), rgba(184,115,51,0.05))',
                          border: `1px solid rgba(${accentRgb},0.3)`,
                          color: p.accent === 'teal' ? '#5BE8D5' : '#D4944A',
                        }}
                      >
                        Connect
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4 text-a7-text">
            Cloud Storage
          </h2>
          <div className="space-y-3">
            {STORAGE.map((p) => {
              const connected = cloudByProvider.get(p.dbProvider);
              const ready = envSet(p.envCheck);
              const accentRgb =
                p.accent === 'teal' ? '45,212,191' : '184,115,51';
              return (
                <div
                  key={p.id}
                  className="relative overflow-hidden rounded-lg p-5 flex items-start gap-4"
                  style={{
                    background:
                      'linear-gradient(180deg, #10100E, #0C0C0A)',
                    border: `1px solid rgba(${accentRgb},0.08)`,
                  }}
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{
                      background: `linear-gradient(90deg, rgba(${accentRgb},0.25), transparent)`,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3
                        className={`font-semibold ${
                          p.accent === 'teal'
                            ? 'text-grad-teal'
                            : 'text-grad-copper'
                        }`}
                      >
                        {p.name}
                      </h3>
                      {connected && (
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            background: 'rgba(45,212,191,0.1)',
                            color: '#5BE8D5',
                          }}
                        >
                          {connected.account_email ?? connected.account_name ?? 'Connected'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-a7-text/40">{p.description}</p>
                    {!ready && (
                      <p className="text-xs text-a7-text/30 mt-2">
                        Set {p.envCheck.join(' + ')} in environment to enable.
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <a
                      href={
                        ready ? `/api/auth/${p.id}/connect?next=/vault` : '#'
                      }
                      aria-disabled={!ready}
                      className={`text-xs px-4 py-2 rounded-md font-medium transition-all ${
                        ready ? 'hover:scale-[1.02]' : 'opacity-40 cursor-not-allowed'
                      }`}
                      style={{
                        background:
                          p.accent === 'teal'
                            ? 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.05))'
                            : 'linear-gradient(135deg, rgba(184,115,51,0.15), rgba(184,115,51,0.05))',
                        border: `1px solid rgba(${accentRgb},0.3)`,
                        color: p.accent === 'teal' ? '#5BE8D5' : '#D4944A',
                      }}
                    >
                      {connected ? 'Reconnect' : 'Connect'}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
