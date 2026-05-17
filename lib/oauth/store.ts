// =============================================================================
// Arrowhead 7 — OAuth Token Store
// =============================================================================
// Reads + writes encrypted credentials to cloud_connections (storage providers)
// and channels (publishing platforms). Accepts an optional Supabase client so
// background jobs (cron) can pass a service-role client.

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { encryptToken, decryptToken } from '@/lib/crypto/tokens';
import type { SupabaseClient } from '@supabase/supabase-js';

export type CloudProvider = 'google_drive' | 'dropbox' | 'onedrive' | 'box' | 'icloud';
export type PublishingPlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'facebook'
  | 'linkedin';

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

export interface CloudConnectionInput {
  user_id: string;
  provider: CloudProvider;
  account_id: string;
  account_email?: string;
  account_name?: string;
  account_avatar_url?: string;
  tokens: OAuthTokens;
  metadata?: Record<string, unknown>;
}

export interface ChannelInput {
  user_id: string;
  platform: PublishingPlatform;
  platform_account_id: string;
  platform_account_name: string;
  platform_avatar_url?: string;
  tokens: OAuthTokens;
}

async function db(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  if (isAdminConfigured()) return getAdminClient();
  return (await createServerSupabaseClient()) as unknown as SupabaseClient;
}

function tokenExpiry(expiresIn?: number): string | null {
  if (!expiresIn) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function tokenScopes(scope?: string): string[] {
  return scope ? scope.split(/\s+/).filter(Boolean) : [];
}

export async function upsertCloudConnection(
  input: CloudConnectionInput,
  client?: SupabaseClient
): Promise<string> {
  const supabase = await db(client);
  const row = {
    user_id: input.user_id,
    provider: input.provider,
    account_id: input.account_id,
    account_email: input.account_email ?? null,
    account_name: input.account_name ?? null,
    account_avatar_url: input.account_avatar_url ?? null,
    access_token_encrypted: encryptToken(input.tokens.access_token),
    refresh_token_encrypted: input.tokens.refresh_token
      ? encryptToken(input.tokens.refresh_token)
      : null,
    token_expires_at: tokenExpiry(input.tokens.expires_in),
    scopes: tokenScopes(input.tokens.scope),
    connection_status: 'connected',
    metadata: input.metadata ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('cloud_connections')
    .upsert(row, { onConflict: 'user_id,provider,account_id' })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to save cloud connection: ${error?.message ?? 'unknown'}`);
  }
  return data.id;
}

export async function upsertChannel(
  input: ChannelInput,
  client?: SupabaseClient
): Promise<string> {
  const supabase = await db(client);
  const row = {
    user_id: input.user_id,
    platform: input.platform,
    platform_account_id: input.platform_account_id,
    platform_account_name: input.platform_account_name,
    platform_avatar_url: input.platform_avatar_url ?? null,
    access_token_encrypted: encryptToken(input.tokens.access_token),
    refresh_token_encrypted: input.tokens.refresh_token
      ? encryptToken(input.tokens.refresh_token)
      : null,
    token_expires_at: tokenExpiry(input.tokens.expires_in),
    scopes: tokenScopes(input.tokens.scope),
    connection_status: 'connected',
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('channels')
    .upsert(row, { onConflict: 'user_id,platform,platform_account_id' })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to save channel: ${error?.message ?? 'unknown'}`);
  }
  return data.id;
}

export interface ResolvedConnection {
  id: string;
  user_id: string;
  account_id: string;
  account_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  metadata: Record<string, unknown> | null;
}

export async function getCloudConnection(
  userId: string,
  provider: CloudProvider,
  client?: SupabaseClient
): Promise<ResolvedConnection | null> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from('cloud_connections')
    .select(
      'id, user_id, account_id, account_name, access_token_encrypted, refresh_token_encrypted, token_expires_at, metadata'
    )
    .eq('user_id', userId)
    .eq('provider', provider)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    user_id: data.user_id,
    account_id: data.account_id,
    account_name: data.account_name,
    access_token: decryptToken(data.access_token_encrypted),
    refresh_token: data.refresh_token_encrypted
      ? decryptToken(data.refresh_token_encrypted)
      : null,
    token_expires_at: data.token_expires_at,
    metadata: data.metadata,
  };
}

export interface ResolvedChannel {
  id: string;
  user_id: string;
  platform: PublishingPlatform;
  platform_account_id: string;
  platform_account_name: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

export async function getChannelById(
  userId: string,
  channelId: string,
  client?: SupabaseClient
): Promise<ResolvedChannel | null> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from('channels')
    .select(
      'id, user_id, platform, platform_account_id, platform_account_name, access_token_encrypted, refresh_token_encrypted, token_expires_at'
    )
    .eq('id', channelId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    user_id: data.user_id,
    platform: data.platform,
    platform_account_id: data.platform_account_id,
    platform_account_name: data.platform_account_name,
    access_token: decryptToken(data.access_token_encrypted),
    refresh_token: data.refresh_token_encrypted
      ? decryptToken(data.refresh_token_encrypted)
      : null,
    token_expires_at: data.token_expires_at,
  };
}

export async function getChannelForUser(
  userId: string,
  platform: PublishingPlatform,
  client?: SupabaseClient
): Promise<ResolvedChannel | null> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from('channels')
    .select(
      'id, user_id, platform, platform_account_id, platform_account_name, access_token_encrypted, refresh_token_encrypted, token_expires_at'
    )
    .eq('user_id', userId)
    .eq('platform', platform)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    user_id: data.user_id,
    platform: data.platform,
    platform_account_id: data.platform_account_id,
    platform_account_name: data.platform_account_name,
    access_token: decryptToken(data.access_token_encrypted),
    refresh_token: data.refresh_token_encrypted
      ? decryptToken(data.refresh_token_encrypted)
      : null,
    token_expires_at: data.token_expires_at,
  };
}

export async function updateChannelTokens(
  channelId: string,
  tokens: OAuthTokens,
  client?: SupabaseClient
): Promise<void> {
  const supabase = await db(client);
  await supabase
    .from('channels')
    .update({
      access_token_encrypted: encryptToken(tokens.access_token),
      ...(tokens.refresh_token
        ? { refresh_token_encrypted: encryptToken(tokens.refresh_token) }
        : {}),
      token_expires_at: tokenExpiry(tokens.expires_in),
      connection_status: 'connected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', channelId);
}

export async function updateCloudConnectionTokens(
  connectionId: string,
  tokens: OAuthTokens,
  client?: SupabaseClient
): Promise<void> {
  const supabase = await db(client);
  await supabase
    .from('cloud_connections')
    .update({
      access_token_encrypted: encryptToken(tokens.access_token),
      ...(tokens.refresh_token
        ? { refresh_token_encrypted: encryptToken(tokens.refresh_token) }
        : {}),
      token_expires_at: tokenExpiry(tokens.expires_in),
      connection_status: 'connected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);
}

export function isTokenExpired(expiresAt: string | null, skewMs = 60_000): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() < skewMs;
}
