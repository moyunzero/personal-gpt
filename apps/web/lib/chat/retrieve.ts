import { generateRagHelperText } from "@personal-gpt/shared/ai/rag-helper";
import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import {
  hybridSearch,
  type Corpus,
  type HybridSearchDeps,
  type RetrievedChunk,
} from "@personal-gpt/shared";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import {
  classifyVectorError,
  formatContextBlocks,
  mapDocsToCitations,
  type RetrievedDoc,
  type VectorSearchResult,
} from "./context";
import {
  ENABLE_HYDE,
  ENABLE_MULTI_QUERY,
  ENABLE_RERANKER,
  RETRIEVAL_GRACE_MS,
  RETRIEVAL_LIMIT,
  TOP1_SIMILARITY_THRESHOLD,
} from "./rag-options";
import { traceRetrieveStep } from "./tracing";

function hitKey(hit: RetrievedChunk): string {
  return `${hit.documentId ?? "unknown"}:${hit.chunkIndex ?? 0}`;
}

function mergeHits(existing: RetrievedChunk[], incoming: RetrievedChunk[]): RetrievedChunk[] {
  const byKey = new Map<string, RetrievedChunk>();
  for (const hit of [...existing, ...incoming]) {
    const key = hitKey(hit);
    const prev = byKey.get(key);
    if (!prev || hit.similarity > prev.similarity) {
      byKey.set(key, hit);
    }
  }
  return [...byKey.values()].sort((a, b) => b.similarity - a.similarity);
}

function passesTop1PreCheck(hits: RetrievedChunk[]): boolean {
  return hits.length > 0 && hits[0]!.similarity >= TOP1_SIMILARITY_THRESHOLD;
}

async function buildSearchQueries(query: string): Promise<string[]> {
  if (!ENABLE_MULTI_QUERY) {
    return [query];
  }

  const raw = await generateRagHelperText(
    "为用户问题生成 3 个简短的检索查询变体，每行一个，不要编号，不要解释。",
    query,
    0.2,
  );

  const variants = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  return variants.length > 0 ? [query, ...variants] : [query];
}

async function buildEmbeddingInput(query: string): Promise<string> {
  if (!ENABLE_HYDE) {
    return query;
  }

  const hypothetical = await generateRagHelperText(
    "写一段能回答用户问题的简短假设性段落，只输出段落正文。",
    query,
    0.3,
  );

  return hypothetical || query;
}

function mapHitsToDocs(hits: RetrievedChunk[]): RetrievedDoc[] {
  return hits.map((hit) => ({
    content: hit.text,
    source: hit.source,
    category: hit.category,
    title: hit.title,
    keywords: hit.keywords,
    $similarity: hit.similarity,
    documentId: hit.documentId,
    chunkIndex: hit.chunkIndex,
  }));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function awaitSearchWithGrace(
  searchPromise: Promise<VectorSearchResult>,
  timeoutMs: number,
  log: ReturnType<typeof logger.child>,
): Promise<VectorSearchResult> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Vector search timeout")), timeoutMs);
    });
    return await Promise.race([searchPromise, timeoutPromise]);
  } catch (error) {
    if (classifyVectorError(error) !== "timeout") {
      throw error;
    }

    log.metric("vector.search.timeout_grace", { graceMs: RETRIEVAL_GRACE_MS });
    const lateResult = await Promise.race([
      searchPromise,
      sleep(RETRIEVAL_GRACE_MS).then(() => null),
    ]);

    if (lateResult) {
      log.debug("宽限期内检索完成，采用延迟结果");
      return lateResult;
    }

    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

export type GetRelevantContextOptions = {
  corpus?: Corpus;
  documentIds?: string[];
  /** 测试注入 hybridSearch deps */
  hybridDeps?: HybridSearchDeps;
};

/**
 * Chat 检索薄封装：可选 HyDE/MQ → shared hybridSearch（含 RRF/rerank/Corrective）。
 * corpus 默认 user（D-27）；seed 须显式传入（D-28）。
 */
export async function getRelevantContext(
  query: string,
  requestId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
  options: GetRelevantContextOptions = {},
): Promise<VectorSearchResult> {
  const log = logger.child({ scope: "chat.retrieve", requestId });
  const corpus = options.corpus ?? "user";

  if (!workspaceId?.trim()) {
    throw new Error("getRelevantContext requires workspaceId");
  }

  const { ASTRA_DB_COLLECTION, VECTOR_SEARCH_TIMEOUT_MS } = env;

  if (!ASTRA_DB_COLLECTION || !query) {
    log.debug("跳过：缺少 collection 或 query");
    return { kind: "no-docs" };
  }

  const traceCtx = { workspaceId, requestId };

  try {
    log.debug("开始检索", {
      query,
      workspaceId,
      corpus,
      hyde: ENABLE_HYDE,
      multiQuery: ENABLE_MULTI_QUERY,
      reranker: ENABLE_RERANKER,
    });

    const searchPromise: Promise<VectorSearchResult> = traceRetrieveStep(
      "retrieve",
      traceCtx,
      async () => {
        const searchQueries = await buildSearchQueries(query);
        let mergedHits: RetrievedChunk[] = [];

        for (const searchQuery of searchQueries) {
          const embeddingInput = await buildEmbeddingInput(searchQuery);
          const hits = await traceRetrieveStep("search", traceCtx, () =>
            hybridSearch(
              {
                query: searchQuery,
                ...(embeddingInput !== searchQuery ? { embedQuery: embeddingInput } : {}),
                workspaceId,
                corpus,
                limit: RETRIEVAL_LIMIT,
                documentIds: options.documentIds,
              },
              options.hybridDeps ?? {},
            ),
          );
          mergedHits = mergeHits(mergedHits, hits);
        }

        log.debug("找到文档", {
          count: mergedHits.length,
          hits: mergedHits.map((d) => ({
            similarity: d.similarity,
            title: d.title,
            source: d.source,
          })),
        });

        if (!passesTop1PreCheck(mergedHits)) {
          return { kind: "no-docs" } as const;
        }

        const relevantDocs = mapHitsToDocs(mergedHits);
        const blocks = formatContextBlocks(relevantDocs);
        const citations = mapDocsToCitations(relevantDocs);
        const sources = Array.from(new Set(relevantDocs.map((doc) => doc.source ?? "unknown")));

        return {
          kind: "ok",
          blocks,
          docCount: relevantDocs.length,
          sources,
          citations,
        } as const;
      },
    );

    return await awaitSearchWithGrace(searchPromise, VECTOR_SEARCH_TIMEOUT_MS, log);
  } catch (error) {
    const kind = classifyVectorError(error);
    if (kind === "timeout") {
      log.metric("vector.search.timeout", { queryLength: query.length });
      return { kind: "timeout" };
    }

    log.metric("vector.search.api_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: "api-error", error };
  }
}
