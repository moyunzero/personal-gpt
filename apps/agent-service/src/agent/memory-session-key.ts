/**
 * Prefer session retrievalCtx.userId for Mem0 scope; ignore forged body keys (D-09/D-12).
 */
export function chooseMemoryUserKey(
  retrievalCtx: { userId?: string } | undefined,
  bodyUserKey: string,
): string {
  const sessionId = retrievalCtx?.userId?.trim();
  if (sessionId) return sessionId;
  return bodyUserKey;
}
