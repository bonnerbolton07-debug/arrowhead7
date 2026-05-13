// =============================================================================
// Arrowhead 7 — Supabase Browser Client
// =============================================================================
// Used in client components (React components with 'use client')

import { createBrowserClient } from '@supabase/ssr';

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Auth service not configured');
  }
  return createBrowserClient(url, key);
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getClient() {
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
