/**
 * Delete document vectors from Astra + ES (D-09).
 */
import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import type { Corpus } from "@personal-gpt/shared";

import { deleteDocumentFromEs } from "./es-upsert";

export async function deleteDocument(
  workspaceId: string,
  documentId: string,
  corpus: Corpus = "user",
): Promise<void> {
  const store = createAstraVectorStore({ corpus });
  await store.deleteByDocument(workspaceId, documentId);
  await deleteDocumentFromEs(workspaceId, documentId, corpus);
}
