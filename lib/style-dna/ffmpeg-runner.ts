// =============================================================================
// Arrowhead 7 — FFmpeg / FFprobe runner
// =============================================================================
// Locates the FFmpeg binaries (preferring the @ffmpeg-installer package, falling
// back to the system PATH or an explicit env var) and exposes a small
// promise-based wrapper around child_process for running them.
//
// All Style DNA analysis flows through this module so the binary path resolution
// is centralised and easily mocked in tests.

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';

let cachedFfmpeg: string | null = null;
let cachedFfprobe: string | null = null;

function tryRequireFfmpegInstaller(): { path?: string } | null {
  try {
    return require('@ffmpeg-installer/ffmpeg') as { path?: string };
  } catch {
    return null;
  }
}

function tryRequireFfprobeInstaller(): { path?: string } | null {
  try {
    return require('@ffprobe-installer/ffprobe') as { path?: string };
  } catch {
    return null;
  }
}

function getFfmpegPath(): string {
  if (cachedFfmpeg) return cachedFfmpeg;
  if (process.env.FFMPEG_PATH) {
    cachedFfmpeg = process.env.FFMPEG_PATH;
    return cachedFfmpeg;
  }
  const installer = tryRequireFfmpegInstaller();
  if (installer?.path) {
    cachedFfmpeg = installer.path;
    return cachedFfmpeg;
  }
  cachedFfmpeg = 'ffmpeg';
  return cachedFfmpeg;
}

function getFfprobePath(): string {
  if (cachedFfprobe) return cachedFfprobe;
  if (process.env.FFPROBE_PATH) {
    cachedFfprobe = process.env.FFPROBE_PATH;
    return cachedFfprobe;
  }
  const installer = tryRequireFfprobeInstaller();
  if (installer?.path) {
    cachedFfprobe = installer.path;
    return cachedFfprobe;
  }
  cachedFfprobe = 'ffprobe';
  return cachedFfprobe;
}

export interface FfmpegRunResult {
  stdout: Buffer;
  stderr: string;
}

export interface FfmpegRunOptions {
  /** Throw if the process exits non-zero. Default true. */
  failOnError?: boolean;
  /** Total timeout in milliseconds. Default 120s. */
  timeoutMs?: number;
  /** Maximum stdout buffer in bytes. Default 256MB. */
  maxStdoutBytes?: number;
}

async function runProcess(
  cmd: string,
  args: readonly string[],
  options: FfmpegRunOptions = {}
): Promise<FfmpegRunResult> {
  const { failOnError = true, timeoutMs = 120_000, maxStdoutBytes = 256 * 1024 * 1024 } = options;

  return new Promise<FfmpegRunResult>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderr = '';
    let killedByTimeout = false;
    let overflow = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutLen += chunk.length;
      if (stdoutLen > maxStdoutBytes) {
        overflow = true;
        child.kill('SIGKILL');
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (overflow) {
        reject(new Error(`${cmd} stdout exceeded ${maxStdoutBytes} bytes`));
        return;
      }
      if (killedByTimeout) {
        reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
        return;
      }
      if (failOnError && code !== 0) {
        reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-2000)}`));
        return;
      }
      resolve({ stdout: Buffer.concat(stdoutChunks), stderr });
    });
  });
}

export async function runFfmpeg(args: readonly string[], options?: FfmpegRunOptions): Promise<FfmpegRunResult> {
  return runProcess(getFfmpegPath(), args, options);
}

export async function runFfprobe(args: readonly string[], options?: FfmpegRunOptions): Promise<FfmpegRunResult> {
  return runProcess(getFfprobePath(), args, options);
}

/**
 * Verify that an FFmpeg binary is reachable. We try to spawn `ffmpeg -version`;
 * if that succeeds the analyser can run for real. Otherwise callers should fall
 * back to the heuristic path (used when running in environments without the
 * binary, e.g. quick local dev without the installer downloaded).
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await runProcess(getFfmpegPath(), ['-version'], { timeoutMs: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convenience helper to remove a temporary file without throwing if it doesn't
 * exist. Used after the analyser is done with the downloaded source.
 */
export async function unlinkQuiet(path: string): Promise<void> {
  try {
    await fs.unlink(path);
  } catch {
    /* ignore */
  }
}
