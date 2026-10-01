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
