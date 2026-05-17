// =============================================================================
// Arrowhead 7 — Safe OAuth Diagnostics
// =============================================================================
// Do not log tokens, auth codes, OAuth state values, or provider secrets.

type LogValue = string | number | boolean | null | undefined;

export function logOAuthEvent(
  provider: string,
  phase: string,
  details: Record<string, LogValue> = {}
): void {
  const safeDetails = Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.slice(0, 120) : value ?? null,
    ])
  );
  console.info(`[oauth:${provider}] ${phase}`, safeDetails);
}

export function oauthErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'oauth_failed';
  if (error.message === 'Unauthorized') return 'Unauthorized';
  return error.message.slice(0, 120) || 'oauth_failed';
}
