import {
  ensureNeo4jGraphConstraintsFromEnv,
  extractGraphFromChunks,
  upsertCatalogEntries,
  upsertDocumentGraph,
  workspaceGraphEndpoint,
  type GraphModelEndpoint,
} from "@personal-gpt/shared";
import type { DataSource } from "typeorm";

import { openModelKey } from "../../../../web/lib/models/model-key";
import { createEntityCatalogStore } from "../entity-catalog-store";
import { graphExtractDurationSeconds } from "../../metrics";

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
  const extractStarted = process.hrtime.bigint();
  const { entities, relations } = await extractGraphFromChunks(
    params.chunks,
    await workspaceChatModel(options.dataSource, params.workspaceId),
  );
  graphExtractDurationSeconds.observe(Number(process.hrtime.bigint() - extractStarted) / 1e9);
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

export function endpointFromSavedModelRow(
  row: { model_id?: string; api_key?: string; base_url?: string } | undefined,
): GraphModelEndpoint | undefined {
  const stored = row?.api_key?.trim();
  if (!row || !stored) return undefined;
  try {
    return workspaceGraphEndpoint({ ...row, api_key: openModelKey(stored) });
  } catch {
    return undefined;
  }
}

async function workspaceChatModel(
  dataSource: DataSource | undefined,
  workspaceId: string,
): Promise<GraphModelEndpoint | undefined> {
  if (!dataSource) return undefined;
  try {
    const rows = (await dataSource.query(
      `SELECT m.model_id, m.api_key, m.base_url
       FROM workspace_llm_prefs p
       JOIN workspace_llm_models m
         ON m.workspace_id = p.workspace_id
        AND m.model_id = CASE
          WHEN p.chat_model_id <> '' THEN p.chat_model_id
          ELSE p.agent_model_id
        END
       WHERE p.workspace_id = $1
       LIMIT 1`,
      [workspaceId],
    )) as { model_id?: string; api_key?: string; base_url?: string }[];
    return endpointFromSavedModelRow(rows[0]);
  } catch {
    return undefined;
  }
}
