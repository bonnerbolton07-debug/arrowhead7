// =============================================================================
// Arrowhead 7 — Supabase Browser Client
// =============================================================================
// Used in client components (React components with 'use client')

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Singleton for client-side usage
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getClient() {
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
