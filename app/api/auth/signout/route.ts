// =============================================================================
// Arrowhead 7 — Sign out
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  }
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}

// Allow GET as a convenience (sign-out link)
export async function GET(request: NextRequest) {
  return POST(request);
}
