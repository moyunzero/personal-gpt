/**
 * Phase 3 regression #1 — Hybrid + 专有名词召回 (RAG-06 / D-30)。
 * BM25 命中专有名词用户文档时，RRF 融合后应压过纯向量 Top-K 的弱语义噪声。
 * 禁止 live LLM。
 */
import { describe, expect, it, vi } from "vitest";

import type { RetrievedChunk, VectorStore } from "@personal-gpt/shared/stores/vector-store";
import { hybridSearch, reciprocalRankFusion } from "@personal-gpt/shared";

const USER_DOC: RetrievedChunk = {
  text: "奥德赛计划书三条路径：保守、平衡、进取。",
  similarity: 0.71,
  documentId: "odyssey-plan-2026",
  chunkIndex: 0,
  title: "奥德赛计划书_2026-06-30",
  source: "奥德赛计划书_2026-06-30.md",
};

const WEAK_VECTOR_NOISE: RetrievedChunk = {
  text: "泛化语义噪声（非用户专有名词文档）",
  similarity: 0.92,
  documentId: "noise-generic",
  chunkIndex: 0,
  title: "generic",
  source: "other-user-note.md",
};

function mockStore(hits: RetrievedChunk[]): VectorStore {
  return {
    upsert: vi.fn(),
    deleteByDocument: vi.fn(),
    search: vi.fn(async () => hits),
  };
}

describe("Phase 3 regression #1: hybrid proper-noun retrieval (RAG-06)", () => {
  it("RRF promotes BM25 proper-noun hit over stronger vector-only noise", () => {
    // Vector ranks noise first; BM25 ranks 奥德赛 first (title/keyword match).
    const vector = [WEAK_VECTOR_NOISE, { ...USER_DOC, similarity: 0.55 }];
    const bm25 = [USER_DOC, { ...WEAK_VECTOR_NOISE, similarity: 0.4 }];

    const fused = reciprocalRankFusion([bm25, vector], 60);

    expect(fused[0]!.documentId).toBe("odyssey-plan-2026");
    expect(fused[0]!.source).toBe("奥德赛计划书_2026-06-30.md");
  });

  it("hybridSearch surfaces proper-noun user doc via BM25+RRF (corpus=user)", async () => {
    process.env.ENABLE_RERANKER = "false";
    process.env.CORRECTIVE_MIN_SCORE = "0";

    const result = await hybridSearch(
      {
        query: "奥德赛计划书给了什么建议",
        workspaceId: "ws-regression",
        corpus: "user",
        limit: 5,
      },
      {
        embed: async () => [0.1, 0.2, 0.3],
        getStore: () => mockStore([WEAK_VECTOR_NOISE, { ...USER_DOC, similarity: 0.55 }]),
        esSearch: async () => [USER_DOC, { ...WEAK_VECTOR_NOISE, similarity: 0.4 }],
        rewriteQuery: async (q) => q,
      },
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.documentId).toBe("odyssey-plan-2026");
    expect(result[0]!.title).toContain("奥德赛");
    expect(result.map((h) => h.source)).not.toContain("psychology-qa");
  });
});
