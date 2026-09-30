/**
 * Guest seed corpus must not pass documentIds:[] — hybrid/graph treat empty array as deny-all.
 * undefined = no ACL filter (seed is public demo corpus).
 */
export function guestRetrievalDocumentIds(input: {
  isGuest: boolean;
  corpus: string;
  allowedDocumentIds: string[];
}): string[] | undefined {
  if (input.isGuest && input.corpus === "seed") {
    return undefined;
  }
  return input.allowedDocumentIds;
}
