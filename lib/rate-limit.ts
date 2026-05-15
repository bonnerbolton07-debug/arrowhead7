// =============================================================================
// Arrowhead 7 — In-Memory Sliding-Window Rate Limiter
// =============================================================================
// Lightweight per-(route, user) sliding-window limiter for the expensive
// routes (analyze, transcribe, render, distribute). Lives in the Node.js
// process memory — good enough while we run a single Vercel function region;
// swap in Upstash if/when we scale horizontally.

import { NextResponse } from 'next/server';

export interface RateLimitConfig {
  /** Max requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'style-dna-analyze': { limit: 3, windowMs: 60_000 },
  'captions-transcribe': { limit: 5, windowMs: 60_000 },
  'shotstack-render': { limit: 5, windowMs: 60_000 },
  'distribute-multi': { limit: 10, windowMs: 60_000 },
};

// Map of "<route>:<userId>" -> sorted timestamps (ms) of recent hits.
const buckets = new Map<string, number[]>();

// Periodically drop empty buckets so the map doesn't grow forever. Only
// schedule the timer in the Node.js runtime; Edge runtime doesn't expose
// setInterval the same way and would keep the function warm needlessly.
const g = globalThis as typeof globalThis & {
  __a7RateLimitSweeper?: ReturnType<typeof setInterval> & {
    unref?: () => void;
  };
};
if (!g.__a7RateLimitSweeper && typeof setInterval !== 'undefined') {
  g.__a7RateLimitSweeper = setInterval(() => {
    const now = Date.now();
    // 5x the longest window is more than enough headroom.
    const cutoff = now - 5 * 60_000;
    const toDelete: string[] = [];
    buckets.forEach((ts, key) => {
      const kept = ts.filter((t: number) => t > cutoff);
      if (kept.length === 0) toDelete.push(key);
      else buckets.set(key, kept);
    });
    toDelete.forEach((k) => buckets.delete(k));
  }, 60_000);
  // Don't keep the event loop alive in long-running servers.
  if (typeof g.__a7RateLimitSweeper.unref === 'function') {
    g.__a7RateLimitSweeper.unref();
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch-ms timestamp when the next request would be permitted. */
  resetAt: number;
  /** Seconds until the next slot frees up — for Retry-After. */
  retryAfterSec: number;
}

export function checkRateLimit(
  routeKey: keyof typeof RATE_LIMITS | string,
  userId: string
): RateLimitResult {
  const cfg = RATE_LIMITS[routeKey];
  if (!cfg) {
    // Unknown route name — fail open so we don't block traffic on a typo.
    return {
      allowed: true,
      limit: Infinity,
      remaining: Infinity,
      resetAt: 0,
      retryAfterSec: 0,
    };
  }

  const now = Date.now();
  const key = `${routeKey}:${userId}`;
  const windowStart = now - cfg.windowMs;
  const previous = buckets.get(key) ?? [];
  const recent = previous.filter((t) => t > windowStart);

  if (recent.length >= cfg.limit) {
    const oldest = recent[0];
    const resetAt = oldest + cfg.windowMs;
    buckets.set(key, recent);
    return {
      allowed: false,
      limit: cfg.limit,
      remaining: 0,
      resetAt,
      retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }

  recent.push(now);
  buckets.set(key, recent);
  return {
    allowed: true,
    limit: cfg.limit,
    remaining: cfg.limit - recent.length,
    resetAt: now + cfg.windowMs,
    retryAfterSec: 0,
  };
}

/**
 * Convenience: if the limit is exceeded, return a NextResponse 429 ready to
 * ship back from a route handler. Otherwise returns null.
 */
export function rateLimitResponse(
  routeKey: string,
  userId: string
): NextResponse | null {
  const result = checkRateLimit(routeKey, userId);
  if (result.allowed) return null;
  const cfg = RATE_LIMITS[routeKey];
  const windowSec = cfg ? Math.round(cfg.windowMs / 1000) : 60;
  return NextResponse.json(
    {
      error: `Rate limit exceeded — ${result.limit} requests per ${windowSec}s. Try again in ${result.retryAfterSec}s.`,
      retryAfterSec: result.retryAfterSec,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSec),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}
