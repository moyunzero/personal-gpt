/**
 * Retriever 薄封装：embed + VectorStore.search，强制 workspaceId（D-00d / D-07）。
 * 不回调 web INTERNAL_PROXY_KEY；不直连 Astra SDK。
 *
 * ISSUE-001 混库召回边界仍存在（本 Phase 不根治）。
 * 低相关 top-K 会诱发模型编造文档：必须用相似度门槛过滤。
 */

import {
  DEFAULT_WORKSPACE_ID,
  createVectorStore,
  embedText,
  type RetrievedChunk,
  type VectorStore,
} from "@personal-gpt/shared";

export const DEFAULT_KB_TOP_K = 5;

/** 与 web ROUTE_RETRIEVE_SIMILARITY 对齐；低于此值视为无有效命中 */
export const DEFAULT_KB_MIN_SIMILARITY = 0.68;

export function resolveKbMinSimilarity(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return override;
  }
  const raw = process.env.AGENT_KB_MIN_SIMILARITY;
  if (!raw) return DEFAULT_KB_MIN_SIMILARITY;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_KB_MIN_SIMILARITY;
}

export type RetrieveKbParams = {
  query: string;
  workspaceId?: string;
  topK?: number;
  /** 最低相似度；缺省 AGENT_KB_MIN_SIMILARITY / 0.68 */
  minSimilarity?: number;
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
  /** 过滤前最高相似度（用于无命中诊断） */
  topSimilarity?: number;
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
  const minSimilarity = resolveKbMinSimilarity(params.minSimilarity);

  // 先取裸召回再过滤，便于报告「最高相似度仍不足」
  const raw = await store.search({
    workspaceId,
    vector,
    limit: topK,
  });
  const topSimilarity = raw[0]?.similarity;
  const chunks = raw.filter((c) => c.similarity >= minSimilarity);

  return { workspaceId, chunks, topSimilarity };
}
