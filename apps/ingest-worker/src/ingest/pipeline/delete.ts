/**
 * Delete document vectors from Astra/Milvus + ES + Neo4j + PG catalog (D-09, GRAPH-04).
 */
import type { Corpus } from "@personal-gpt/shared";
import { deleteCatalogForDocument, deleteGraphForDocument } from "@personal-gpt/shared";
import { shouldWriteAstra, shouldWriteMilvus } from "@personal-gpt/shared/stores/vector-store";
import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import { createMilvusVectorStore } from "@personal-gpt/shared/stores/vector-store.milvus";
import type { DataSource } from "typeorm";

import { createEntityCatalogStore } from "../entity-catalog-store";

import { deleteDocumentFromEs } from "./es-upsert";

export type DeleteDocumentOptions = {
  dataSource?: DataSource;
};

export async function deleteDocument(
  workspaceId: string,
  documentId: string,
  corpus: Corpus = "user",
  options: DeleteDocumentOptions = {},
): Promise<void> {
  const errors: Error[] = [];
  const tasks: Promise<void>[] = [];

  tasks.push(
    deleteGraphForDocument(workspaceId, documentId).catch((err) => {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }),
  );

  if (options.dataSource) {
    const store = createEntityCatalogStore(options.dataSource);
    tasks.push(
      deleteCatalogForDocument(workspaceId, documentId, store)
        .then(() => undefined)
        .catch((err) => {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }),
    );
  }

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
