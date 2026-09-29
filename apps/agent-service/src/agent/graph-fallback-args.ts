/**
 * KB-miss graph_search args must include workspaceId like prefetch (D-22).
 */
export function graphFallbackInvokeArgs(input: {
  question: string;
  workspaceId: string;
  documentIds?: string[];
}): {
  question: string;
  workspaceId: string;
  documentIds?: string[];
} {
  return {
    question: input.question,
    workspaceId: input.workspaceId,
    documentIds: input.documentIds,
  };
}
