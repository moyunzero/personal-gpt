/**
 * Delete document vectors from Astra/Milvus + ES (D-09).
 */
import type { Corpus } from "@personal-gpt/shared";
import { shouldWriteAstra, shouldWriteMilvus } from "@personal-gpt/shared/stores/vector-store";
import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import { createMilvusVectorStore } from "@personal-gpt/shared/stores/vector-store.milvus";

import { deleteDocumentFromEs } from "./es-upsert";

export async function deleteDocument(
  workspaceId: string,
  documentId: string,
  corpus: Corpus = "user",
): Promise<void> {
  if (shouldWriteAstra()) {
    await createAstraVectorStore({ corpus }).deleteByDocument(workspaceId, documentId);
  }
  if (shouldWriteMilvus()) {
    await createMilvusVectorStore({ corpus }).deleteByDocument(workspaceId, documentId);
  }
  await deleteDocumentFromEs(workspaceId, documentId, corpus);
}
