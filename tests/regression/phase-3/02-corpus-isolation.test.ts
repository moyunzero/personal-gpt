/**
 * Phase 3 regression #2 — Corpus isolation (CORPUS-01 / D-30 / ISSUE-001)。
 * corpus=user 时禁止引用 psychology-qa（物理分库 + 默认 user）。
 * 禁止 live LLM。
 */
import { describe, expect, it, vi } from "vitest";

import type { RetrievedChunk, VectorStore } from "@personal-gpt/shared/stores/vector-store";
import { hybridSearch } from "@personal-gpt/shared";

const USER_HIT: RetrievedChunk = {
  text: "用户私有计划书内容",
  similarity: 0.8,
  documentId: "user-doc-1",
  chunkIndex: 0,
  title: "奥德赛计划书_2026-06-30",
  source: "奥德赛计划书_2026-06-30.md",
};

const SEED_HIT: RetrievedChunk = {
  text: "心理学问答噪声",
  similarity: 0.95,
  documentId: "psy-1",
  chunkIndex: 0,
  title: "psychology",
  source: "psychology-qa",
};

function mockStore(hits: RetrievedChunk[]): VectorStore {
  return {
    upsert: vi.fn(),
    deleteByDocument: vi.fn(),
    search: vi.fn(async () => hits),
  };
}

describe("Phase 3 regression #2: corpus isolation forbids psychology-qa (CORPUS-01/D-30)", () => {
  it("forbids psychology-qa citation when corpus=user (ISSUE-001 / migrate-corpus-split)", async () => {
    process.env.ENABLE_RERANKER = "false";
    process.env.CORRECTIVE_MIN_SCORE = "0";

    const getStore = vi.fn((corpus: string) => {
      // Physical split: user collection never contains psychology-qa rows.
      if (corpus === "user") return mockStore([USER_HIT]);
      return mockStore([SEED_HIT]);
    });

    const esSearch = vi.fn(async (params: { corpus?: string }) => {
      if (params.corpus === "user" || params.corpus == null) return [USER_HIT];
      return [SEED_HIT];
    });

    const result = await hybridSearch(
      {
        query: "奥德赛计划书给了什么建议",
        workspaceId: "ws-regression",
        corpus: "user",
        limit: 5,
      },
      {
        embed: async () => [0.1, 0.2, 0.3],
        getStore: getStore as (corpus: "user" | "seed") => VectorStore,
        esSearch,
        rewriteQuery: async (q) => q,
      },
    );

    expect(getStore).toHaveBeenCalledWith("user");
    expect(getStore).not.toHaveBeenCalledWith("seed");
    expect(esSearch).toHaveBeenCalledWith(expect.objectContaining({ corpus: "user" }));

    expect(result.length).toBeGreaterThan(0);
    for (const hit of result) {
      expect(hit.source).not.toBe("psychology-qa");
      expect(hit.source).not.toMatch(/psychology/i);
    }
    expect(result.every((h) => h.source !== "psychology-qa")).toBe(true);
    expect(result.map((h) => h.source)).toContain("奥德赛计划书_2026-06-30.md");
  });

  it("defaults to corpus=user so mixed seed store is not queried", async () => {
    process.env.ENABLE_RERANKER = "false";
    process.env.CORRECTIVE_MIN_SCORE = "0";

    const getStore = vi.fn((corpus: string) => {
      if (corpus === "user") return mockStore([USER_HIT]);
      return mockStore([SEED_HIT]);
    });

    const result = await hybridSearch(
      {
        query: "泛化问法",
        workspaceId: "ws-regression",
        // corpus omitted → default user (D-27)
        limit: 3,
      },
      {
        embed: async () => [0.1],
        getStore: getStore as (corpus: "user" | "seed") => VectorStore,
        esSearch: async () => [USER_HIT],
        rewriteQuery: async (q) => q,
      },
    );

    expect(getStore).toHaveBeenCalledWith("user");
    expect(result.every((h) => h.source !== "psychology-qa")).toBe(true);
  });
});
