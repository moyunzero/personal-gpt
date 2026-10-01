/** Whether ingest catch should delete vector/graph rows after failure. */
export function shouldCleanupVectorsAfterFailure(input: {
  vectorsCommitted: boolean;
  /** Reindex / had prior ready vectors — do not wipe on pre-upsert failure. */
  preserveExistingVectors?: boolean;
}): boolean {
  if (input.vectorsCommitted) return false;
  if (input.preserveExistingVectors) return false;
  return true;
}

/**
 * Reindex: drop prior graph/catalog before re-extract so stale entities do not linger
 * after a successful upsert (vectors are overwritten by documentId; graph merges otherwise).
 */
export function shouldPurgeGraphBeforeReextract(input: {
  preserveExistingVectors?: boolean;
}): boolean {
  return Boolean(input.preserveExistingVectors);
}

/**
 * After purge-before-reextract, graph extract failure must fail the job —
 * otherwise we mark ready with an empty graph (data loss).
 * First-time ingest may keep vectors ready when graph extract fails.
 */
export function shouldFailJobOnGraphExtractError(input: {
  preserveExistingVectors?: boolean;
  graphWasPurged: boolean;
}): boolean {
  return Boolean(input.preserveExistingVectors && input.graphWasPurged);
}
