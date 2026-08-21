import { embedText } from "@personal-gpt/shared/ai/embeddings";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { EmbeddingCache, makeEmbeddingCacheKey } from "./embedding-cache";

let embeddingCache: EmbeddingCache | undefined;

function getEmbeddingCache(): EmbeddingCache {
  if (!embeddingCache) {
    embeddingCache = new EmbeddingCache(env.EMBEDDING_CACHE_SIZE);
  }
  return embeddingCache;
}

/**
 * 带进程内 LRU 缓存的 query embedding（retrieve 与路由预检共用）。
 */
export async function embedQueryText(
  text: string,
  log: ReturnType<typeof logger.child> = logger.child({ scope: "chat.embedding" }),
): Promise<number[] | null> {
  const cacheKey = makeEmbeddingCacheKey(text);
  const cache = getEmbeddingCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    log.metric("embedding.cache.hit", { cacheSize: cache.size() });
    return cached;
  }

  log.metric("embedding.cache.miss", { cacheSize: cache.size() });
  try {
    const vector = await embedText(text);
    if (!vector.length) {
      return null;
    }
    cache.set(cacheKey, vector);
    return vector;
  } catch (error) {
    log.warn("embedding 调用失败，返回 null（fail-open）", {
      err: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
