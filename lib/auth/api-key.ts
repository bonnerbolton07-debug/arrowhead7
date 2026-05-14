// =============================================================================
// Arrowhead 7 — API Key Validation
// =============================================================================
// Reads `Authorization: Bearer a7sk_...` from a request, SHA-256-hashes the
// token, and looks up the matching row in public.api_keys. Returns the
// owning user's id when the key is valid (not revoked), null otherwise.
//
// Studio-tier users mint keys client-side in ApiKeysSection.tsx — that file
// stores `hashed_key = sha256(raw)`, so this helper uses the same digest.
//
// Uses the service-role admin client because the api_keys row is owned by
// the caller's user_id but the request has no Supabase session attached.

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

export interface ApiKeyPrincipal {
  userId: string;
  apiKeyId: string;
  scopes: string[];
}

const BEARER_RE = /^Bearer\s+(a7sk_[A-Za-z0-9_-]+)$/;

function extractBearer(request: NextRequest): string | null {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(BEARER_RE);
  return match ? match[1] : null;
}

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Resolve an API key from the request. Returns the owning principal on
 * success, or null when the header is missing / malformed / revoked.
 *
 * Touches `last_used_at` as a fire-and-forget side effect so admins can see
 * which keys are live.
 */
export async function authenticateApiKey(
  request: NextRequest
): Promise<ApiKeyPrincipal | null> {
  const raw = extractBearer(request);
  if (!raw) return null;
  if (!isAdminConfigured()) return null;

  const hashed = hashKey(raw);
  const admin = getAdminClient();

  const { data, error } = await admin
    .from('api_keys')
    .select('id, user_id, scopes, revoked_at')
    .eq('hashed_key', hashed)
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !data) return null;

  // Best-effort touch — don't block the caller if it fails.
  admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(({ error: e }) => {
      if (e) {
        console.error('[api-key] failed to update last_used_at', {
          apiKeyId: data.id,
          error: e.message,
        });
      }
    });

  return {
    userId: data.user_id as string,
    apiKeyId: data.id as string,
    scopes: (data.scopes ?? []) as string[],
  };
}

/**
 * Convenience: returns the principal, or a NextResponse 401 if no valid key
 * was supplied. Route handlers can do:
 *
 *   const auth = await requireApiKey(request);
 *   if (auth instanceof NextResponse) return auth;
 *   // ... use auth.userId
 */
export async function requireApiKey(
  request: NextRequest
): Promise<ApiKeyPrincipal | NextResponse> {
  const principal = await authenticateApiKey(request);
  if (principal) return principal;
  return NextResponse.json(
    { error: 'Invalid or missing API key. Send `Authorization: Bearer a7sk_...`.' },
    { status: 401 }
  );
}
