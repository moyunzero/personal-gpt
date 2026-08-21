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
    const listA = [
      chunk("docA", 0, 0.9),
      chunk("docB", 0, 0.8),
      chunk("docC", 0, 0.7),
    ];
    const listB = [
      chunk("docB", 0, 0.95),
      chunk("docA", 0, 0.85),
      chunk("docD", 0, 0.5),
    ];

    const fused = reciprocalRankFusion([listA, listB], 60);

    // docA: 1/(60+1) + 1/(60+2) = 1/61 + 1/62
    // docB: 1/(60+2) + 1/(60+1) = 1/62 + 1/61  (same as A)
    // docC: 1/(60+3) = 1/63
    // docD: 1/(60+3) = 1/63
    const scoreAB = 1 / 61 + 1 / 62;
    const scoreC = 1 / 63;

    expect(fused).toHaveLength(4);
    expect(fused[0]!.similarity).toBeCloseTo(scoreAB, 10);
    expect(fused[1]!.similarity).toBeCloseTo(scoreAB, 10);
    // A and B tie on score; order among ties is sort-stable by Map insertion
    const topIds = new Set([fused[0]!.documentId, fused[1]!.documentId]);
    expect(topIds).toEqual(new Set(["docA", "docB"]));
    expect(fused[2]!.documentId).toBe("docC");
    expect(fused[2]!.similarity).toBeCloseTo(scoreC, 10);
    expect(fused[3]!.documentId).toBe("docD");
    expect(fused[3]!.similarity).toBeCloseTo(scoreC, 10);
  });

  it("ranks a unique top hit above single-list competitors", () => {
    const vector = [chunk("onlyVec", 0, 0.99), chunk("shared", 1, 0.5)];
    const bm25 = [chunk("shared", 1, 0.9), chunk("onlyEs", 0, 0.8)];

    const fused = reciprocalRankFusion([vector, bm25], 60);

    expect(fused[0]!.documentId).toBe("shared");
    expect(fused[0]!.similarity).toBeCloseTo(1 / 61 + 1 / 62, 10);
    expect(fused.map((c) => `${c.documentId}:${c.chunkIndex}`)).toEqual([
      "shared:1",
      "onlyVec:0",
      "onlyEs:0",
    ]);
  });
});
