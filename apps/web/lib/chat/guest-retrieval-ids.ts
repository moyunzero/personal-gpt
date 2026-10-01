/**
 * Seed corpus is a shared demo KB — never apply user document allowlists
 * (empty [] is deny-all in hybrid/graph; user doc ids never match seed chunks).
 * For corpus=user, pass the caller's allowlist as-is (empty = deny-all).
 */
export function guestRetrievalDocumentIds(input: {
  corpus: string;
  allowedDocumentIds: string[];
}): string[] | undefined {
  if (input.corpus === "seed") {
    return undefined;
  }
  return input.allowedDocumentIds;
}
