// =============================================================================
// Arrowhead 7 — Supabase Admin (Service Role) Client
// =============================================================================
// Used only by trusted server-side code (cron jobs, webhook handlers).
// Bypasses RLS — callers must enforce their own authorization.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Supabase admin not configured. Set SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
