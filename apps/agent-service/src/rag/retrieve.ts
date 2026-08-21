/**
 * Retriever 薄封装：shared hybridSearch（D-12/D-29）。
 * 强制 workspaceId；默认 corpus=user（D-27）。
 */

import {
  DEFAULT_WORKSPACE_ID,
  hybridSearch,
  type Corpus,
  type HybridSearchDeps,
  type RetrievedChunk,
} from "@personal-gpt/shared";

export const DEFAULT_KB_TOP_K = 5;

/**
 * Agent 有效命中门槛（略高于 Chat Path A 的 0.55，降低幻觉面）。
 * 长任务句请配合 extractKbSearchQuery；可用 AGENT_KB_MIN_SIMILARITY 覆盖。
 */
export const DEFAULT_KB_MIN_SIMILARITY = 0.6;

function isValidSimilarity(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

export function resolveKbMinSimilarity(override?: number): number {
  if (typeof override === "number" && isValidSimilarity(override)) {
    return override;
  }
  const raw = process.env.AGENT_KB_MIN_SIMILARITY;
  if (!raw) return DEFAULT_KB_MIN_SIMILARITY;
  const n = Number.parseFloat(raw);
  return isValidSimilarity(n) ? n : DEFAULT_KB_MIN_SIMILARITY;
}

export type RetrieveKbParams = {
  query: string;
  workspaceId?: string;
  topK?: number;
  /** 最低相似度；缺省 AGENT_KB_MIN_SIMILARITY / 0.60 */
  minSimilarity?: number;
  /** 默认 user；seed 须显式（D-27/D-28） */
  corpus?: Corpus;
  /** 测试注入 hybridSearch deps */
  hybridDeps?: HybridSearchDeps;
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

export async function retrieveKb(params: RetrieveKbParams): Promise<KbRetrieveResult> {
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

  const corpus = params.corpus ?? "user";
  const minSimilarity = resolveKbMinSimilarity(params.minSimilarity);

  const raw = await hybridSearch(
    {
      query,
      workspaceId,
      corpus,
      limit: topK,
    },
    params.hybridDeps ?? {},
  );

  const topSimilarity =
    raw.length === 0
      ? undefined
      : raw.reduce((max, c) => (c.similarity > max ? c.similarity : max), raw[0]!.similarity);
  const chunks = raw.filter((c) => c.similarity >= minSimilarity);

  return { workspaceId, chunks, topSimilarity };
}
