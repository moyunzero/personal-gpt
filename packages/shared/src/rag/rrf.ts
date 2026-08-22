import type { RetrievedChunk } from "../stores/vector-store";

/**
 * Classic reciprocal rank fusion: Σ 1/(k + rank) keyed by documentId:chunkIndex.
 * MUST NOT concatenate-then-rerank (reference hybrid anti-pattern / Pitfall 1).
 */
export function reciprocalRankFusion(
  lists: RetrievedChunk[][],
  k: number = Number(process.env.RRF_K ?? 60),
): RetrievedChunk[] {
  const rankConstant = Number.isFinite(k) && k > 0 ? k : 60;
  const scores = new Map<string, { chunk: RetrievedChunk; score: number; listIdx: number }>();

  for (let listIdx = 0; listIdx < lists.length; listIdx++) {
    const list = lists[listIdx]!;
    list.forEach((chunk, idx) => {
      const id = `${chunk.documentId ?? ""}:${chunk.chunkIndex ?? idx}`;
      const add = 1 / (rankConstant + idx + 1);
      const prev = scores.get(id);
      if (!prev) {
        scores.set(id, { chunk, score: add, listIdx });
        return;
      }
      prev.score += add;
      // Prefer later lists (vector cosine) over earlier BM25 payloads for gating similarity.
      if (listIdx > prev.listIdx) {
        prev.chunk = {
          ...chunk,
          bm25Score: chunk.bm25Score ?? prev.chunk.bm25Score,
        };
        prev.listIdx = listIdx;
      } else if (listIdx === prev.listIdx && chunk.similarity > prev.chunk.similarity) {
        prev.chunk = {
          ...chunk,
          bm25Score: chunk.bm25Score ?? prev.chunk.bm25Score,
        };
      } else if (chunk.bm25Score != null && prev.chunk.bm25Score == null) {
        prev.chunk = { ...prev.chunk, bm25Score: chunk.bm25Score };
      }
    });
  }

  // Rank by RRF score only — keep original vector/BM25 similarity for downstream
  // gates (Chat TOP1, Corrective, Agent minSimilarity) which expect cosine-scale.
  return [...scores.values()].sort((a, b) => b.score - a.score).map(({ chunk }) => chunk);
}
