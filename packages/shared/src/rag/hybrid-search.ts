import { embedText } from "../ai/embeddings";
import type { RetrievedChunk, VectorStore } from "../stores/vector-store";
import { createVectorStoreFromEnv } from "../stores/vector-store.factory";
import type { Corpus } from "./corpus";
import { esBm25Search } from "./es-bm25";
import { maybeCorrective } from "./corrective";
import { reciprocalRankFusion } from "./rrf";
import { rerankDedicated } from "./rerank";

export type HybridSearchParams = {
  query: string;
  workspaceId: string;
  /** Default "user" (D-27) — seed must be explicit */
  corpus?: Corpus;
  limit?: number;
};

export type HybridSearchDeps = {
  embed?: (text: string) => Promise<number[]>;
  getStore?: (corpus: Corpus) => VectorStore;
  esSearch?: typeof esBm25Search;
  rerank?: typeof rerankDedicated;
  rewriteQuery?: (query: string) => Promise<string>;
  /** Internal: second pass after Corrective — skip another rewrite (D-33). */
  skipCorrective?: boolean;
  logWarn?: (message: string, meta?: Record<string, unknown>) => void;
};

const DEFAULT_LIMIT = 5;
const CANDIDATE_LIMIT = 10;

/** VectorStore bound to corpus via VECTOR_BACKEND factory (D-24 / STORE-01). */
export function getVectorStoreForCorpus(corpus: Corpus): VectorStore {
  return createVectorStoreFromEnv({ corpus });
}

function isRerankerEnabled(): boolean {
  return process.env.ENABLE_RERANKER !== "false";
}

async function hybridSearchOnce(
  params: HybridSearchParams,
  deps: HybridSearchDeps,
): Promise<RetrievedChunk[]> {
  const corpus = params.corpus ?? "user";
  const limit = params.limit ?? DEFAULT_LIMIT;
  const embed = deps.embed ?? embedText;
  const getStore = deps.getStore ?? getVectorStoreForCorpus;
  const esSearch = deps.esSearch ?? esBm25Search;
  const rerank = deps.rerank ?? rerankDedicated;
  const logWarn =
    deps.logWarn ??
    ((message: string, meta?: Record<string, unknown>) => {
      console.warn(`[hybridSearch] ${message}`, meta ?? {});
    });

  const vector = await embed(params.query);

  const vectorPromise = getStore(corpus).search({
    workspaceId: params.workspaceId,
    vector,
    limit: CANDIDATE_LIMIT,
  });

  const esPromise = esSearch({
    query: params.query,
    workspaceId: params.workspaceId,
    corpus,
    limit: CANDIDATE_LIMIT,
  }).catch((err: unknown) => {
    logWarn("es unavailable; vector-only", { err });
    return [] as RetrievedChunk[];
  });

  const [vectorHits, esHits] = await Promise.all([vectorPromise, esPromise]);

  let fused = reciprocalRankFusion([esHits, vectorHits]);

  if (isRerankerEnabled() && fused.length > 0) {
    fused = await rerank(params.query, fused, limit);
  }

  return fused.slice(0, limit);
}

/**
 * Shared hybrid entry (D-12): embed → parallel vector ∥ BM25 → RRF → optional rerank → Corrective.
 * ES errors fail-open to vector-only (D-13). Corrective max 1 rewrite (D-32–D-34).
 */
export async function hybridSearch(
  params: HybridSearchParams,
  deps: HybridSearchDeps = {},
): Promise<RetrievedChunk[]> {
  if (!params.workspaceId?.trim()) {
    throw new Error("hybridSearch requires workspaceId");
  }

  const fused = await hybridSearchOnce(params, deps);

  if (deps.skipCorrective) {
    return fused;
  }

  return maybeCorrective(params, fused, {
    rewrite: deps.rewriteQuery,
    reSearch: (query) => hybridSearch({ ...params, query }, { ...deps, skipCorrective: true }),
  });
}
