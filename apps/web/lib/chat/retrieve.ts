import OpenAI from "openai";

import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import { createVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import {
  classifyVectorError,
  formatContextBlocks,
  type RetrievedDoc,
  type VectorSearchResult,
} from "./context";
import { EmbeddingCache, makeEmbeddingCacheKey } from "./embedding-cache";

const {
  ASTRA_DB_COLLECTION,
  OPENROUTER_API_KEY,
  VECTOR_SEARCH_TIMEOUT_MS,
  EMBEDDING_CACHE_SIZE,
} = env;

const openRouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
});

const embeddingCache = new EmbeddingCache(EMBEDDING_CACHE_SIZE);

/**
 * 向量检索：embedding → VectorStore.search(workspaceId) → 阈值过滤 → context 块。
 */
export async function getRelevantContext(
  query: string,
  requestId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<VectorSearchResult> {
  const log = logger.child({ scope: "chat.retrieve", requestId });

  if (!ASTRA_DB_COLLECTION || !query) {
    log.debug("跳过：缺少 collection 或 query");
    return { kind: "no-docs" };
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    log.debug("开始检索", { query, workspaceId });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Vector search timeout")),
        VECTOR_SEARCH_TIMEOUT_MS,
      );
    });

    const searchPromise: Promise<VectorSearchResult> = (async () => {
      const cacheKey = makeEmbeddingCacheKey(query);
      let vector = embeddingCache.get(cacheKey);

      if (vector) {
        log.metric("embedding.cache.hit", { cacheSize: embeddingCache.size() });
      } else {
        log.metric("embedding.cache.miss", { cacheSize: embeddingCache.size() });
        log.debug("生成 embedding");
        const embeddings = await openRouterClient.embeddings.create({
          model: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
          input: query,
          encoding_format: "float",
        });

        vector = embeddings.data[0]?.embedding;
        if (!vector) {
          log.warn("embedding 生成失败");
          return { kind: "no-docs" } as const;
        }
        embeddingCache.set(cacheKey, vector);
      }

      const vectorStore = createVectorStore();
      const hits = await vectorStore.search({
        workspaceId,
        vector,
        limit: 5,
        similarityThreshold: 0.6,
      });

      log.debug("找到文档", {
        count: hits.length,
        hits: hits.map((d) => ({
          similarity: d.similarity,
          title: d.title,
          source: d.source,
        })),
      });

      if (hits.length === 0) {
        return { kind: "no-docs" } as const;
      }

      const relevantDocs: RetrievedDoc[] = hits.map((hit) => ({
        content: hit.text,
        source: hit.source,
        category: hit.category,
        title: hit.title,
        keywords: hit.keywords,
        $similarity: hit.similarity,
      }));

      const blocks = formatContextBlocks(relevantDocs);
      const sources = Array.from(
        new Set(relevantDocs.map((doc) => doc.source ?? "unknown")),
      );

      log.debug("返回上下文", { length: blocks.length });

      return {
        kind: "ok",
        blocks,
        docCount: relevantDocs.length,
        sources,
      } as const;
    })();

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
