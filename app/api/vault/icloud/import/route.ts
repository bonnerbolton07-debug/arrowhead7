// =============================================================================
// Arrowhead 7 — iCloud Drive: Import from share link
// =============================================================================
// Accepts a public iCloud Drive share URL, resolves it through Apple's
// public-records API, streams the file into R2, and records a virtual
// "connection" so the iCloud card on the Vault page shows as connected.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { downloadIcloudShare, isIcloudShareUrl } from '@/lib/cloud/icloud';
import { uploadToR2 } from '@/lib/cloudflare/r2';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { encryptToken } from '@/lib/crypto/tokens';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'icloud-file';
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const shareUrl: string | undefined = body.shareUrl;
    const editId: string = body.editId || uuidv4();

    if (!shareUrl || !isIcloudShareUrl(shareUrl)) {
      return NextResponse.json(
        { error: 'Provide a public iCloud Drive share link (https://www.icloud.com/iclouddrive/…)' },
        { status: 400 }
      );
    }

    const { stream, contentType, name } = await downloadIcloudShare(shareUrl);
    const buf = await streamToBuffer(stream);
    const filename = sanitizeName(name);
    const key = `sources/${user.id}/${editId}/${filename}`;
    await uploadToR2(key, buf, contentType || 'application/octet-stream');

    // Record a virtual "connection" so the iCloud tile flips to connected
    // and the rest of the vault UI lists the user's recent iCloud imports.
    try {
      const supabase = await createServerSupabaseClient();
      await supabase.from('cloud_connections').upsert(
        {
          user_id: user.id,
          provider: 'icloud',
          account_id: 'share-link',
          account_email: null,
          account_name: 'Share-link mode',
          // No OAuth token to store, but the column is NOT NULL — encrypt a
          // sentinel so the schema invariant + future decryptToken() reads
          // both still succeed.
          access_token_encrypted: encryptToken('share-link'),
          connection_status: 'connected',
          metadata: { mode: 'share-link', last_url: shareUrl },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider,account_id' }
      );
    } catch {
      // Non-fatal — connection row is cosmetic.
    }

    return NextResponse.json({
      editId,
      key,
      name: filename,
      size: buf.length,
      mimeType: contentType,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('iCloud import error:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
