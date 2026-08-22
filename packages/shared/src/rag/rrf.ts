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
  const scores = new Map<string, { chunk: RetrievedChunk; score: number }>();

  for (const list of lists) {
    list.forEach((chunk, idx) => {
      const id = `${chunk.documentId ?? ""}:${chunk.chunkIndex ?? idx}`;
      const add = 1 / (rankConstant + idx + 1);
      const prev = scores.get(id);
      if (!prev) {
        scores.set(id, { chunk, score: add });
        return;
      }
      prev.score += add;
      // Prefer higher original similarity as representative payload when tying ids
      if (chunk.similarity > prev.chunk.similarity) {
        prev.chunk = chunk;
      }
    });
  }

  // Rank by RRF score only — keep original vector/BM25 similarity for downstream
  // gates (Chat TOP1, Corrective, Agent minSimilarity) which expect cosine-scale.
  return [...scores.values()].sort((a, b) => b.score - a.score).map(({ chunk }) => chunk);
}
