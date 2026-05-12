// =============================================================================
// Arrowhead 7 — Supabase Server Client
// =============================================================================
// Used in Server Components, Route Handlers, Server Actions

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component — can't set cookies, ignore
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // Server Component — can't delete cookies, ignore
          }
        },
      },
    }
  );
}

/**
 * Get the current authenticated user or null.
 * Use in server components / route handlers.
 */
export async function getUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Require authentication — throws if not logged in.
 * Use in protected API routes.
 */
export async function requireUser() {
  const user = await getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
