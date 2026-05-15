// =============================================================================
// Arrowhead 7 — R2 Storage Cleanup Cron
// =============================================================================
// Purges abandoned multipart uploads and stale `processing/` intermediate
// files older than 24h. R2 doesn't expire either on its own, so without this
// sweep both leak storage indefinitely.
//
// Scheduled on Vercel via vercel.json. Protected by CRON_SECRET — Vercel sends
// it as a Bearer token.

import { NextRequest, NextResponse } from 'next/server';
import { purgeStaleR2 } from '@/lib/cloudflare/r2';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

async function run(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await purgeStaleR2();
    console.info('[cleanup/r2] sweep complete', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[cleanup/r2] sweep failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'R2 cleanup failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
