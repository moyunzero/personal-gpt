/**
 * reciprocalRankFusion unit tests — classic Σ 1/(k+rank), not concat merge.
 */
import { describe, expect, it } from "vitest";

import type { RetrievedChunk } from "../stores/vector-store";
import { reciprocalRankFusion } from "./rrf";

function chunk(
  documentId: string,
  chunkIndex: number,
  similarity: number,
  text = `${documentId}-${chunkIndex}`,
): RetrievedChunk {
  return { documentId, chunkIndex, similarity, text };
}

describe("reciprocalRankFusion", () => {
  it("fuses two ranked lists with classic RRF scores (k=60)", () => {
    const listA = [chunk("docA", 0, 0.9), chunk("docB", 0, 0.8), chunk("docC", 0, 0.7)];
    const listB = [chunk("docB", 0, 0.95), chunk("docA", 0, 0.85), chunk("docD", 0, 0.5)];

    const fused = reciprocalRankFusion([listA, listB], 60);

    // docA / docB tie on RRF (1/61+1/62); order among ties is Map-insertion stable.
    // similarity stays max original cosine — not the raw RRF magnitude.
    expect(fused).toHaveLength(4);
    const topIds = new Set([fused[0]!.documentId, fused[1]!.documentId]);
    expect(topIds).toEqual(new Set(["docA", "docB"]));
    expect(fused[0]!.similarity).toBeGreaterThanOrEqual(0.85);
    expect(fused[1]!.similarity).toBeGreaterThanOrEqual(0.85);
    expect(fused[2]!.documentId).toBe("docC");
    expect(fused[2]!.similarity).toBe(0.7);
    expect(fused[3]!.documentId).toBe("docD");
    expect(fused[3]!.similarity).toBe(0.5);
  });

  it("ranks a unique top hit above single-list competitors", () => {
    const vector = [chunk("onlyVec", 0, 0.99), chunk("shared", 1, 0.5)];
    const bm25 = [chunk("shared", 1, 0.9), chunk("onlyEs", 0, 0.8)];

    const fused = reciprocalRankFusion([vector, bm25], 60);

    expect(fused[0]!.documentId).toBe("shared");
    // Prefer higher original similarity when merging same id
    expect(fused[0]!.similarity).toBe(0.9);
    expect(fused.map((c) => `${c.documentId}:${c.chunkIndex}`)).toEqual([
      "shared:1",
      "onlyVec:0",
      "onlyEs:0",
    ]);
  });
});
