import {
  ensureNeo4jGraphConstraintsFromEnv,
  extractGraphFromChunks,
  upsertCatalogEntries,
  upsertDocumentGraph,
} from "@personal-gpt/shared";
import type { DataSource } from "typeorm";

import { createEntityCatalogStore } from "../entity-catalog-store";

export type ExtractAndUpsertGraphParams = {
  workspaceId: string;
  documentId: string;
  chunks: string[];
};

export type ExtractAndUpsertGraphOptions = {
  dataSource?: DataSource;
};

/** Ingest graph step: LLM extract → Neo4j upsert → PG catalog sync (D-08, D-48). */
export async function extractAndUpsertGraph(
  params: ExtractAndUpsertGraphParams,
  options: ExtractAndUpsertGraphOptions = {},
): Promise<void> {
  const { entities, relations } = await extractGraphFromChunks(params.chunks);
  await ensureNeo4jGraphConstraintsFromEnv();
  await upsertDocumentGraph({
    workspaceId: params.workspaceId,
    documentId: params.documentId,
    entities,
    relations,
  });

  if (!options.dataSource) {
    throw new Error("extractAndUpsertGraph requires dataSource for catalog sync (D-48)");
  }

  const store = createEntityCatalogStore(options.dataSource);
  await upsertCatalogEntries(
    {
      workspaceId: params.workspaceId,
      documentId: params.documentId,
      entities,
    },
    store,
  );
}
