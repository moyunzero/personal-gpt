/**
 * Rule-based Corrective inside shared hybrid (D-32–D-34):
 * top1 score < CORRECTIVE_MIN_SCORE → rewrite query once → reSearch.
 * No Corrective sub-Agent; max 1 rewrite (D-33).
 */

import { generateRagHelperText } from "../ai/rag-helper";
import type { RetrievedChunk } from "../stores/vector-store";
import type { HybridSearchParams } from "./hybrid-search";

const DEFAULT_CORRECTIVE_MIN_SCORE = 0.35;
/** ES returns raw BM25 (_score typically ~5–30 for real hits); 1 was effectively no gate. */
const DEFAULT_CORRECTIVE_BM25_MIN_SCORE = 5;

export function correctiveMinScore(): number {
  const raw = process.env.CORRECTIVE_MIN_SCORE;
  if (!raw) return DEFAULT_CORRECTIVE_MIN_SCORE;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_CORRECTIVE_MIN_SCORE;
}

/** BM25-only hits must meet this score to skip rewrite (weak similarity===0 + tiny bm25 still rewrite). */
export function correctiveBm25MinScore(): number {
  const raw = process.env.CORRECTIVE_BM25_MIN_SCORE;
  if (!raw) return DEFAULT_CORRECTIVE_BM25_MIN_SCORE;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CORRECTIVE_BM25_MIN_SCORE;
}

/** D-34: 「不够相关」= top1 effective score 低于阈值；空结果亦触发改写。
 * Effective score = max(similarity, rerankScore??0). Strong BM25-only hits
 * (bm25Score >= threshold, non-empty text, similarity 0) skip rewrite. */
export function needsCorrectiveRewrite(
  hits: RetrievedChunk[],
  minScore: number = correctiveMinScore(),
): boolean {
  if (hits.length === 0) return true;
  const top = hits[0]!;
  const effective = Math.max(top.similarity, top.rerankScore ?? 0);
  if (effective >= minScore) return false;
  const bm25Ok =
    typeof top.bm25Score === "number" &&
    Number.isFinite(top.bm25Score) &&
    top.bm25Score >= correctiveBm25MinScore() &&
    top.text.trim().length > 0;
  if (bm25Ok && top.similarity === 0 && (top.rerankScore == null || top.rerankScore === 0)) {
    return false;
  }
  return effective < minScore;
}

async function defaultRewrite(query: string): Promise<string> {
  const raw = await generateRagHelperText(
    "你是检索查询改写器。将用户问题改写成更利于知识库检索的简短查询，保留专有名词与编号。只输出改写后的查询，不要解释。",
    query,
    0,
  );
  const trimmed = raw.trim();
  return trimmed || query;
}

export type MaybeCorrectiveDeps = {
  reSearch: (query: string) => Promise<RetrievedChunk[]>;
  rewrite?: (query: string) => Promise<string>;
  minScore?: number;
  /** Second hybrid pass — never rewrite again (D-33). */
  alreadyCorrected?: boolean;
};

/**
 * After RRF(+rerank): if below threshold, rewrite once and re-run search.
 * Caller must pass alreadyCorrected on the second hybrid pass.
 */
export async function maybeCorrective(
  params: HybridSearchParams,
  hits: RetrievedChunk[],
  deps: MaybeCorrectiveDeps,
): Promise<RetrievedChunk[]> {
  if (deps.alreadyCorrected) return hits;

  const minScore = deps.minScore ?? correctiveMinScore();
  if (!needsCorrectiveRewrite(hits, minScore)) return hits;

  const rewrite = deps.rewrite ?? defaultRewrite;
  let rewritten: string;
  try {
    rewritten = (await rewrite(params.query)).trim();
  } catch {
    // Rewrite LLM failure must not fail the hybrid pipeline
    return hits;
  }
  if (!rewritten || rewritten === params.query.trim()) {
    return hits;
  }

  try {
    const next = await deps.reSearch(rewritten);
    if (!next.length) return hits;
    return next;
  } catch {
    return hits;
  }
}
