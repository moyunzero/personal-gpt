/** Whether ingest catch should delete vector/graph rows after failure. */
export function shouldCleanupVectorsAfterFailure(input: { vectorsCommitted: boolean }): boolean {
  return !input.vectorsCommitted;
}
