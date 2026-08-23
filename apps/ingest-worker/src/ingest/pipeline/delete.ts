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
  const errors: Error[] = [];
  const tasks: Promise<void>[] = [];

  if (shouldWriteAstra()) {
    tasks.push(
      createAstraVectorStore({ corpus })
        .deleteByDocument(workspaceId, documentId)
        .catch((err) => {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }),
    );
  }
  if (shouldWriteMilvus()) {
    tasks.push(
      createMilvusVectorStore({ corpus })
        .deleteByDocument(workspaceId, documentId)
        .catch((err) => {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }),
    );
  }

  await Promise.all(tasks);

  try {
    await deleteDocumentFromEs(workspaceId, documentId, corpus);
  } catch (err) {
    errors.push(err instanceof Error ? err : new Error(String(err)));
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, `deleteDocument failed for ${documentId}`);
  }
}
