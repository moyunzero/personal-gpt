/**
 * Server-side origin gate for token-consuming chat.
 * Referer alone is NOT trusted — clients can forge it with curl.
 * Note: Origin can also be forged by non-browser clients; real spend control
 * depends on guest/user rate limits, not this allowlist alone.
 */
export function isOriginAllowed(
  headers: { get(name: string): string | null },
  allowedOrigins: ReadonlySet<string>,
): boolean {
  const origin = headers.get("origin");
  if (origin && allowedOrigins.has(origin)) return true;
  return false;
}
