/**
 * Strip client userKey and inject session user id for Agent memory (D-12).
 */
export function injectSessionUserKey(
  parsedBody: Record<string, unknown>,
  retrievalCtx: { userId: string },
): void {
  delete parsedBody.userKey;
  parsedBody.userKey = retrievalCtx.userId;
}
