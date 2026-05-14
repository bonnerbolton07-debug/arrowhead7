// =============================================================================
// Arrowhead 7 — URL safety helpers (SSRF defense)
// =============================================================================
// Used before passing user-controlled URLs to server-side fetch/FFmpeg/yt-dlp.

const PRIVATE_IPV4_REGEX = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,
  /^22[4-9]\./,
  /^25[0-5]\./,
];

function isIPv4Literal(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function isIPv6Literal(host: string): boolean {
  return host.includes(':');
}

/**
 * True if the hostname is an IP literal that points at a private / loopback /
 * link-local / metadata range. We block these to prevent SSRF.
 */
export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost') return true;
  if (isIPv4Literal(host)) {
    return PRIVATE_IPV4_REGEX.some((re) => re.test(host));
  }
  if (isIPv6Literal(host)) {
    // ::1 loopback, fc00::/7 unique-local, fe80::/10 link-local, ::ffff:* IPv4-mapped
    if (host === '::1' || host === '::') return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
    if (host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')) return true;
    if (host.startsWith('::ffff:')) return true;
    return false;
  }
  return false;
}

/**
 * Returns true if `hostname` matches `pattern`. Pattern can be:
 *   - exact: "vimeo.com"
 *   - wildcard prefix: "*.cloudflarestream.com"
 *   - bare: also matches any subdomain ("vimeo.com" matches "player.vimeo.com")
 */
export function hostnameMatches(hostname: string, pattern: string): boolean {
  const h = hostname.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // ".cloudflarestream.com"
    return h === suffix.slice(1) || h.endsWith(suffix);
  }
  return h === p || h.endsWith(`.${p}`);
}

export interface AssertSafeOptions {
  /** Allowed hostnames (exact or `*.suffix`). Bare names also match subdomains. */
  allowedHosts: string[];
  /** Only `https:` is allowed by default. */
  allowHttp?: boolean;
}

/**
 * Throws if `urlString` is not a safe URL to fetch from the server.
 * Validates protocol (https only by default), hostname allowlist, and rejects
 * IP literals that resolve to private / loopback / link-local ranges.
 */
export function assertSafeFetchUrl(urlString: string, opts: AssertSafeOptions): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Invalid URL');
  }

  const allowedProtocols = opts.allowHttp ? ['http:', 'https:'] : ['https:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Disallowed URL protocol: ${parsed.protocol}`);
  }

  const host = parsed.hostname;
  if (isPrivateOrLoopbackHost(host)) {
    throw new Error('URL hostname resolves to a private or loopback address');
  }

  const allowed = opts.allowedHosts.some((p) => hostnameMatches(host, p));
  if (!allowed) {
    throw new Error(`URL hostname not in allowlist: ${host}`);
  }

  return parsed;
}

/**
 * Build the default allowlist of trusted media hosts based on env config.
 * Includes the configured R2 bucket / public domain and Cloudflare Stream.
 */
export function trustedMediaHosts(): string[] {
  const hosts: string[] = ['*.cloudflarestream.com', '*.r2.cloudflarestorage.com'];
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (accountId) {
    hosts.push(`${accountId}.r2.cloudflarestorage.com`);
    hosts.push(`customer-${accountId}.cloudflarestream.com`);
  }
  const r2Public = process.env.R2_PUBLIC_DOMAIN;
  if (r2Public) hosts.push(r2Public);
  return hosts;
}

/**
 * Allowlist of social-media hosts we can hand off to yt-dlp for Style DNA.
 */
export const SOCIAL_MEDIA_HOSTS = [
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'tiktok.com',
  'vimeo.com',
  'x.com',
  'twitter.com',
];
