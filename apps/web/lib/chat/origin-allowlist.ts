/**
 * Server-side origin gate for token-consuming chat.
 * Referer alone is NOT trusted — clients can forge it with curl.
 */
export function isOriginAllowed(
  headers: { get(name: string): string | null },
  allowedOrigins: ReadonlySet<string>,
): boolean {
  const origin = headers.get("origin");
  if (origin && allowedOrigins.has(origin)) return true;
  return false;
}
