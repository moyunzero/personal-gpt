import { embedText } from "@personal-gpt/shared/ai/embeddings";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { EmbeddingCache, makeEmbeddingCacheKey } from "./embedding-cache";

const { EMBEDDING_CACHE_SIZE } = env;

const embeddingCache = new EmbeddingCache(EMBEDDING_CACHE_SIZE);

/**
 * 带进程内 LRU 缓存的 query embedding（retrieve 与路由预检共用）。
 */
export async function embedQueryText(
  text: string,
  log: ReturnType<typeof logger.child> = logger.child({ scope: "chat.embedding" }),
): Promise<number[] | null> {
  const cacheKey = makeEmbeddingCacheKey(text);
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    log.metric("embedding.cache.hit", { cacheSize: embeddingCache.size() });
    return cached;
  }

  log.metric("embedding.cache.miss", { cacheSize: embeddingCache.size() });
  const vector = await embedText(text);
  if (!vector.length) {
    return null;
  }

  embeddingCache.set(cacheKey, vector);
  return vector;
}
