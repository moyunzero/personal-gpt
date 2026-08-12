/**
 * Retriever 薄封装：embed + VectorStore.search，强制 workspaceId（D-00d / D-07）。
 * 不回调 web INTERNAL_PROXY_KEY；不直连 Astra SDK。
 *
 * ISSUE-001 混库召回边界仍存在（本 Phase 不根治）。
 */

import {
  DEFAULT_WORKSPACE_ID,
  createVectorStore,
  embedText,
  type RetrievedChunk,
  type VectorStore,
} from "@personal-gpt/shared";

export const DEFAULT_KB_TOP_K = 5;

export type RetrieveKbParams = {
  query: string;
  workspaceId?: string;
  topK?: number;
  /** 测试注入；缺省 createVectorStore() */
  store?: VectorStore;
  /** 测试注入；缺省 embedText */
  embed?: (text: string) => Promise<number[]>;
};

/**
 * Agent 逻辑 id `default` / 空 → 与 web RAG 相同的 DEFAULT_WORKSPACE_ID。
 */
export function resolveWorkspaceId(workspaceId?: string): string {
  const raw = workspaceId?.trim();
  if (!raw || raw === "default") {
    return DEFAULT_WORKSPACE_ID;
  }
  return raw;
}

export type KbRetrieveResult = {
  workspaceId: string;
  chunks: RetrievedChunk[];
};

export async function retrieveKb(
  params: RetrieveKbParams,
): Promise<KbRetrieveResult> {
  const workspaceId = resolveWorkspaceId(params.workspaceId);
  if (!workspaceId) {
    throw new Error("retrieveKb requires workspaceId");
  }

  const query = params.query?.trim();
  if (!query) {
    return { workspaceId, chunks: [] };
  }

  const topK =
    typeof params.topK === "number" && params.topK > 0
      ? Math.min(params.topK, 20)
      : DEFAULT_KB_TOP_K;

  const embed = params.embed ?? embedText;
  const store = params.store ?? createVectorStore();
  const vector = await embed(query);

  const chunks = await store.search({
    workspaceId,
    vector,
    limit: topK,
  });

  return { workspaceId, chunks };
}
