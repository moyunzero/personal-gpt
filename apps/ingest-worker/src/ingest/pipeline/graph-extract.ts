import {
  ensureNeo4jGraphConstraintsFromEnv,
  extractGraphFromChunks,
  upsertDocumentGraph,
} from "@personal-gpt/shared";

export type ExtractAndUpsertGraphParams = {
  workspaceId: string;
  documentId: string;
  chunks: string[];
};

/** Ingest graph step: LLM extract all chunks → Neo4j upsert (D-08, D-11). */
export async function extractAndUpsertGraph(params: ExtractAndUpsertGraphParams): Promise<void> {
  const { entities, relations } = await extractGraphFromChunks(params.chunks);
  await ensureNeo4jGraphConstraintsFromEnv();
  await upsertDocumentGraph({
    workspaceId: params.workspaceId,
    documentId: params.documentId,
    entities,
    relations,
  });
}
