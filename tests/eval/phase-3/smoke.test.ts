/**
 * Phase 3 GOLDEN-01 CI smoke (deterministic — no live LLM judge).
 *
 * Nightly (full g01–g25 retrieval + intent cases):
 *   yarn eval:phase-3:nightly
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
const goldenPath = join(__dirname, "golden.json");
const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as GoldenItem[];

/** CI smoke subset: first 5 user-corpus items (deterministic citation checks). */
const SMOKE_IDS = new Set(["g01", "g02", "g03", "g04", "g05"]);

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

describe("Phase 3 GOLDEN-01 CI smoke (deterministic)", () => {
  it("golden.json has ≥20 items with corpus + citation constraints", () => {
    expect(golden.length).toBeGreaterThanOrEqual(20);
    for (const item of golden) {
      expect(item.id).toBeTruthy();
      expect(item.query.length).toBeGreaterThan(0);
      expect(["user", "seed"]).toContain(item.corpus);
      if (item.expectCitationSource) {
        expect(item.expectCitationSource.length).toBeGreaterThan(0);
      }
    }
    // Must not reuse Phase 5 EVAL-01 naming in this artifact set
    const raw = readFileSync(goldenPath, "utf8");
    expect(raw).not.toMatch(/EVAL-01/);
    expect(raw).not.toMatch(/RAGAS/i);
  });

  it("smoke subset: corpus=user hybridSearch citations match expected source", async () => {
    process.env.ENABLE_RERANKER = "false";
    process.env.CORRECTIVE_MIN_SCORE = "0";

    const smokeItems = golden.filter((g) => SMOKE_IDS.has(g.id));
    expect(smokeItems.length).toBe(SMOKE_IDS.size);

    for (const item of smokeItems) {
      const hit = hitFor(item);
      const result = await hybridSearch(
        {
          query: item.query,
          workspaceId: "ws-golden-smoke",
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

  it("intent golden g23–g25: resolveIntentPlan primary + retrieverTools (D-09)", async () => {
    const intentIds = new Set(["g23", "g24", "g25"]);
    const intentItems = golden.filter((g) => intentIds.has(g.id));
    expect(intentItems.length).toBe(3);

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
