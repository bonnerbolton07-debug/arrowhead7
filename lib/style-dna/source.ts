// =============================================================================
// Arrowhead 7 — Source resolution for the Style DNA analyser
// =============================================================================
// Converts a reference (an R2 key, a presigned URL, an HTTP URL, or a social
// media URL) into a local path the FFmpeg pipeline can read.
//
// For social URLs we attempt to shell out to `yt-dlp` when it is available.
// Without yt-dlp we surface a clear error so the caller can ask the user to
// upload the file directly.

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPresignedDownloadUrl } from '@/lib/cloudflare/r2';

export interface ResolvedSource {
  /** Local path the FFmpeg pipeline can read */
  path: string;
  /** Whether the file was downloaded just for this analysis (caller should delete) */
  ephemeral: boolean;
}

const TMP_PREFIX = 'a7-dna-';

export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function looksLikeR2Key(value: string): boolean {
  return /^(sources|processing|references)\//.test(value);
}

/** Best-effort: infer the file extension from an R2 key or URL path. */
function extensionFor(reference: string): string {
  const path = reference.split('?')[0].split('#')[0];
  const m = path.match(/\.([a-zA-Z0-9]{1,5})$/);
  if (m) return m[1].toLowerCase();
  return 'mp4';
}

export function detectPlatform(value: string): 'instagram' | 'tiktok' | 'youtube' | 'x' | 'other' | null {
  if (!looksLikeUrl(value)) return null;
  if (/instagram\.com/.test(value)) return 'instagram';
  if (/tiktok\.com/.test(value)) return 'tiktok';
  if (/(youtube\.com|youtu\.be)/.test(value)) return 'youtube';
  if (/(x\.com|twitter\.com)/.test(value)) return 'x';
  return 'other';
}

/**
 * Resolve a reference to a local file path that FFmpeg can read.
 * Caller is responsible for cleaning up ephemeral files when done.
 */
export async function resolveSource(reference: string): Promise<ResolvedSource> {
  const ext = extensionFor(reference);
  if (looksLikeR2Key(reference)) {
    const url = await getPresignedDownloadUrl(reference, 3600);
    return downloadToTmp(url, ext);
  }
  if (looksLikeUrl(reference)) {
    const platform = detectPlatform(reference);
    if (platform && platform !== 'other') {
      return downloadSocial(reference);
    }
    return downloadToTmp(reference, ext);
  }
  // Local path (test/dev)
  if (await pathExists(reference)) {
    return { path: reference, ephemeral: false };
  }
  throw new Error(`Cannot resolve reference: ${reference}`);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadToTmp(url: string, ext: string = 'mp4'): Promise<ResolvedSource> {
  const dest = path.join(tmpdir(), `${TMP_PREFIX}${randomUUID()}.${ext}`);

  // 30s to connect and receive response headers.
  const fetchController = new AbortController();
  const connectTimeout = setTimeout(() => fetchController.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: fetchController.signal });
  } finally {
    clearTimeout(connectTimeout);
  }

  if (!res.ok || !res.body) {
    throw new Error(`Failed to download source (${res.status})`);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  // 1GB ceiling — anything bigger is rejected to keep tmp predictable.
  const MAX = 1024 * 1024 * 1024;
  const reader = res.body.getReader();

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Race each chunk read against a 20s stall guard.
      let stallHandle: ReturnType<typeof setTimeout> | undefined;
      const stall = new Promise<never>((_, reject) => {
        stallHandle = setTimeout(
          () => reject(new Error('Source download stalled — no data received for 20s')),
          20_000
        );
      });
      const chunk = await Promise.race([reader.read(), stall]);
      clearTimeout(stallHandle);

      if (chunk.done) break;
      if (chunk.value) {
        total += chunk.value.byteLength;
        if (total > MAX) throw new Error('Source exceeds 1GB ceiling for analysis');
        chunks.push(chunk.value);
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  await fs.writeFile(dest, buf);
  return { path: dest, ephemeral: true };
}

async function downloadSocial(url: string): Promise<ResolvedSource> {
  const ytdlp = process.env.YTDLP_PATH || 'yt-dlp';
  const dest = path.join(tmpdir(), `${TMP_PREFIX}${randomUUID()}.mp4`);
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    '-f',
    'mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
    '-o',
    dest,
    url,
  ];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ytdlp, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Social URL download timed out after 30s — upload the file directly instead.'));
    }, 30_000);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Social URL fetch requires yt-dlp (not found: ${err.message}). Upload the file directly instead.`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`yt-dlp exited ${code} for ${url}`));
    });
  });
  if (!(await pathExists(dest))) {
    throw new Error('yt-dlp succeeded but produced no file');
  }
  return { path: dest, ephemeral: true };
}
