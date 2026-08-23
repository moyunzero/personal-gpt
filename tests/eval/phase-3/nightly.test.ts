/**
 * Phase 3 GOLDEN-01 nightly — full deterministic golden set (g01–g25).
 * Smoke subset remains in smoke.test.ts (eval:phase-3).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { RetrievedChunk, VectorStore } from "@personal-gpt/shared/stores/vector-store";
import { hybridSearch } from "@personal-gpt/shared";
import { resolveIntentPlan } from "@personal-gpt/shared/routing";

type GoldenItem = {
  id: string;
  query: string;
  corpus: "user" | "seed";
  expectCitationSource?: string;
  forbidSources?: string[];
  expectIntentPrimary?: string;
  expectTool?: string | null;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(__dirname, "golden.json"), "utf8")) as GoldenItem[];

function mockStore(hits: RetrievedChunk[]): VectorStore {
  return {
    upsert: vi.fn(),
    deleteByDocument: vi.fn(),
    search: vi.fn(async () => hits),
  };
}

function hitFor(item: GoldenItem): RetrievedChunk {
  return {
    text: `fixture for ${item.id}: ${item.query}`,
    similarity: 0.9,
    documentId: `doc-${item.id}`,
    chunkIndex: 0,
    title: item.expectCitationSource,
    source: item.expectCitationSource,
  };
}

describe("Phase 3 GOLDEN-01 nightly (full set)", () => {
  it("runs hybridSearch for every golden item with corpus constraints", async () => {
    process.env.ENABLE_RERANKER = "false";
    process.env.CORRECTIVE_MIN_SCORE = "0";

    const retrievalItems = golden.filter((g) => g.expectCitationSource);
    expect(retrievalItems.length).toBeGreaterThanOrEqual(20);

    for (const item of retrievalItems) {
      const hit = hitFor(item);
      const result = await hybridSearch(
        {
          query: item.query,
          workspaceId: "ws-golden-nightly",
          corpus: item.corpus,
          limit: 3,
        },
        {
          embed: async () => [0.1, 0.2],
          getStore: () => mockStore([hit]),
          esSearch: async () => [hit],
          rewriteQuery: async (q) => q,
        },
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.source).toBe(item.expectCitationSource);
      for (const forbidden of item.forbidSources ?? []) {
        expect(result.every((h) => h.source !== forbidden)).toBe(true);
      }
    }
  });

  it("runs intent golden g23–g25 for every nightly build", async () => {
    const intentIds = new Set(["g23", "g24", "g25"]);
    const intentItems = golden.filter((g) => intentIds.has(g.id));
    expect(intentItems).toHaveLength(3);

    for (const item of intentItems) {
      const probeKb = vi.fn().mockResolvedValue({
        probed: true,
        topSimilarity: item.id === "g25" ? 0.9 : 0.2,
        title: item.id === "g25" ? "奥德赛计划书" : undefined,
      });

      const { plan } = await resolveIntentPlan(item.query, { probeKb });
      expect(plan.primary).toBe(item.expectIntentPrimary);
      if (item.expectTool) {
        expect(plan.retrieverTools).toContain(item.expectTool);
      } else {
        expect(plan.retrieverTools).toEqual([]);
      }
    }
  });
});
