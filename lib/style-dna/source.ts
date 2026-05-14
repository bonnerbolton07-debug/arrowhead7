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
import { createWriteStream, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPresignedDownloadUrl } from '@/lib/cloudflare/r2';
import {
  assertSafeFetchUrl,
  SOCIAL_MEDIA_HOSTS,
  trustedMediaHosts,
} from '@/lib/security/url-safety';

export interface ResolvedSource {
  /** Local path the FFmpeg pipeline can read */
  path: string;
  /** Whether the file was downloaded just for this analysis (caller should delete) */
  ephemeral: boolean;
}

const TMP_PREFIX = 'a7-dna-';
/** Hard cap on a single source download. 30s comfortably covers a 50–100MB
 *  presigned R2 fetch on a healthy connection; anything slower than that on a
 *  serverless Lambda will eat the entire route budget. The route-level Promise.race
 *  was meant to bound this, but `fetch()` doesn't honour that race — the body
 *  read loop keeps draining bytes long after the route timer fires. Adding a
 *  download-side AbortController is what actually stops the hang. */
const DOWNLOAD_TIMEOUT_MS = 30_000;
/** 1GB ceiling — anything bigger is rejected to keep tmp predictable. */
const MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024;

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
      // Restrict yt-dlp inputs to known social-media hosts (SSRF protection).
      assertSafeFetchUrl(reference, { allowedHosts: SOCIAL_MEDIA_HOSTS });
      // Social URLs require yt-dlp which isn't available on serverless.
      // Check upfront and give a clear user-facing error.
      if (!(await isYtdlpAvailable())) {
        const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
        throw new Error(
          `${platformLabel} URLs can't be analyzed directly. Save the video to your device and upload the file instead.`
        );
      }
      return downloadSocial(reference);
    }
    // Direct URL fetch — must point at our own storage/CDN, not arbitrary hosts.
    assertSafeFetchUrl(reference, { allowedHosts: trustedMediaHosts() });
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Source download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`);
    }
    throw err;
  }
  if (!res.ok || !res.body) {
    clearTimeout(timer);
    throw new Error(`Failed to download source (${res.status})`);
  }

  // Stream to disk instead of buffering the whole file in memory. With ~1GB
  // ceilings on serverless heaps, accumulating a Uint8Array array and then
  // Buffer.concat'ing it was a real risk for large references; piping to a
  // write stream keeps memory flat. The AbortController also stops the read
  // loop if the body stalls mid-transfer.
  const writeStream = createWriteStream(dest);
  let total = 0;
  const reader = res.body.getReader();
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES) {
        controller.abort();
        throw new Error('Source exceeds 1GB ceiling for analysis');
      }
      if (!writeStream.write(Buffer.from(value))) {
        // Honour backpressure so we don't blow the heap on fast networks.
        await new Promise<void>((resolve, reject) => {
          writeStream.once('drain', resolve);
          writeStream.once('error', reject);
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    // Best-effort cleanup so we don't leak a half-downloaded file in tmp.
    writeStream.destroy();
    await fs.unlink(dest).catch(() => undefined);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Source download stalled after ${DOWNLOAD_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  return { path: dest, ephemeral: true };
}

/** Quick check whether yt-dlp is reachable (cached after first call). */
let _ytdlpChecked: boolean | null = null;
async function isYtdlpAvailable(): Promise<boolean> {
  if (_ytdlpChecked !== null) return _ytdlpChecked;
  const bin = process.env.YTDLP_PATH || 'yt-dlp';
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, ['--version'], { stdio: 'ignore' });
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timeout')); }, 3_000);
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
      child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`exit ${code}`)); });
    });
    _ytdlpChecked = true;
  } catch {
    _ytdlpChecked = false;
  }
  return _ytdlpChecked;
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
    child.on('error', () =>
      reject(new Error('Social media URLs can\'t be analyzed directly. Save the video to your device and upload the file instead.'))
    );
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`yt-dlp exited ${code} for ${url}`))
    );
  });
  if (!(await pathExists(dest))) {
    throw new Error('yt-dlp succeeded but produced no file');
  }
  return { path: dest, ephemeral: true };
}
