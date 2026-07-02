import OpenAI from "openai";

import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import type { RetrievedChunk } from "@personal-gpt/shared/stores/vector-store";
import { createVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import {
  classifyVectorError,
  formatContextBlocks,
  mapDocsToCitations,
  type RetrievedDoc,
  type VectorSearchResult,
} from "./context";
import { traceRetrieveStep } from "./tracing";
import { EmbeddingCache, makeEmbeddingCacheKey } from "./embedding-cache";
import {
  ENABLE_HYDE,
  ENABLE_MULTI_QUERY,
  ENABLE_RERANKER,
  RERANKER_CANDIDATE_LIMIT,
  RETRIEVAL_LIMIT,
  TOP1_SIMILARITY_THRESHOLD,
} from "./rag-options";

const {
  ASTRA_DB_COLLECTION,
  OPENROUTER_API_KEY,
  VECTOR_SEARCH_TIMEOUT_MS,
  EMBEDDING_CACHE_SIZE,
} = env;

const EMBEDDING_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2:free";
const HYDE_MODEL = "inclusionai/ring-2.6-1t:free";

const openRouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
});

const embeddingCache = new EmbeddingCache(EMBEDDING_CACHE_SIZE);

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

function applyReranker(hits: RetrievedChunk[]): RetrievedChunk[] {
  if (!ENABLE_RERANKER) {
    return hits.slice(0, RETRIEVAL_LIMIT);
  }
  return [...hits]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, RETRIEVAL_LIMIT);
}

function passesTop1PreCheck(hits: RetrievedChunk[]): boolean {
  return hits.length > 0 && hits[0].similarity >= TOP1_SIMILARITY_THRESHOLD;
}

async function embedText(text: string, log: ReturnType<typeof logger.child>): Promise<number[] | null> {
  const cacheKey = makeEmbeddingCacheKey(text);
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    log.metric("embedding.cache.hit", { cacheSize: embeddingCache.size() });
    return cached;
  }

  log.metric("embedding.cache.miss", { cacheSize: embeddingCache.size() });
  const embeddings = await openRouterClient.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    encoding_format: "float",
  });

  const vector = embeddings.data[0]?.embedding;
  if (!vector) {
    return null;
  }

  embeddingCache.set(cacheKey, vector);
  return vector;
}

async function buildSearchQueries(query: string): Promise<string[]> {
  if (!ENABLE_MULTI_QUERY) {
    return [query];
  }

  const completion = await openRouterClient.chat.completions.create({
    model: HYDE_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Generate exactly 3 short search query variants for retrieval. Return one variant per line, no numbering.",
      },
      { role: "user", content: query },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
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

  const completion = await openRouterClient.chat.completions.create({
    model: HYDE_MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "Write a concise hypothetical passage that would answer the user question. Output passage text only.",
      },
      { role: "user", content: query },
    ],
  });

  const hypothetical = completion.choices[0]?.message?.content?.trim();
  return hypothetical || query;
}

async function searchWorkspace(
  workspaceId: string,
  vector: number[],
): Promise<RetrievedChunk[]> {
  const vectorStore = createVectorStore();
  const limit = ENABLE_RERANKER ? RERANKER_CANDIDATE_LIMIT : RETRIEVAL_LIMIT;

  return vectorStore.search({
    workspaceId,
    vector,
    limit,
    similarityThreshold: 0.6,
  });
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

/**
 * 向量检索：embedding → VectorStore.search(workspaceId) → 阈值过滤 → context 块。
 * HyDE / Multi-Query / Reranker 仅在 rag-options 开关为 true 时启用。
 */
export async function getRelevantContext(
  query: string,
  requestId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<VectorSearchResult> {
  const log = logger.child({ scope: "chat.retrieve", requestId });

  if (!workspaceId?.trim()) {
    throw new Error("getRelevantContext requires workspaceId");
  }

  if (!ASTRA_DB_COLLECTION || !query) {
    log.debug("跳过：缺少 collection 或 query");
    return { kind: "no-docs" };
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const traceCtx = { workspaceId, requestId };

  try {
    log.debug("开始检索", { query, workspaceId });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Vector search timeout")),
        VECTOR_SEARCH_TIMEOUT_MS,
      );
    });

    const searchPromise: Promise<VectorSearchResult> = traceRetrieveStep(
      "retrieve",
      traceCtx,
      async () => {
      const searchQueries = await buildSearchQueries(query);
      let mergedHits: RetrievedChunk[] = [];

      for (const searchQuery of searchQueries) {
        const embeddingInput = await buildEmbeddingInput(searchQuery);
        const vector = await traceRetrieveStep("embed", traceCtx, () =>
          embedText(embeddingInput, log),
        );
        if (!vector) {
          log.warn("embedding 生成失败");
          continue;
        }

        const hits = await traceRetrieveStep("search", traceCtx, () =>
          searchWorkspace(workspaceId, vector),
        );
        mergedHits = mergeHits(mergedHits, hits);
      }

      mergedHits = applyReranker(mergedHits);

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
      const sources = Array.from(
        new Set(relevantDocs.map((doc) => doc.source ?? "unknown")),
      );

      log.debug("返回上下文", { length: blocks.length });

      return {
        kind: "ok",
        blocks,
        docCount: relevantDocs.length,
        sources,
        citations,
      } as const;
      },
    );

    return await Promise.race([searchPromise, timeoutPromise]);
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
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}
