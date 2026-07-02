import { DataAPIClient } from "@datastax/astra-db-ts";
import OpenAI from "openai";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import {
  classifyVectorError,
  formatContextBlocks,
  type RetrievedDoc,
  type VectorSearchResult,
} from "./context";
import { EmbeddingCache, makeEmbeddingCacheKey } from "./embedding-cache";
import { detectQuerySource } from "./query-classifier";

const {
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  OPENROUTER_API_KEY,
  VECTOR_SEARCH_TIMEOUT_MS,
  EMBEDDING_CACHE_SIZE,
} = env;

// ====================== 模块级单例 ======================
// 这些 client 在进程内复用，冷启实例化一次。Vercel serverless 上每个 cold
// container 各一份；自托管长进程下保持长连接。需要 DI / mock 时再加参数。

const openRouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
});

const embeddingCache = new EmbeddingCache(EMBEDDING_CACHE_SIZE);

interface AstraCollection {
  find: (query: object, options: object) => { toArray: () => Promise<unknown[]> };
  insertOne: (doc: object) => Promise<unknown>;
}

interface AstraDb {
  collection: (name: string) => AstraCollection;
}

let db: AstraDb | null = null;

function getDb(): AstraDb {
  if (!db) {
    const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
    db = client.db(ASTRA_DB_API_ENDPOINT, {
      token: ASTRA_DB_APPLICATION_TOKEN,
    });
  }
  return db;
}

// ====================== 检索入口 ======================
/**
 * 跑一次向量检索：embedding（命中 cache 时跳过）→ astra similarity search →
 * 阈值过滤 → 拼 <context> 块。
 *
 * 返回 VectorSearchResult（ok / no-docs / timeout / api-error）让调用方知道
 * 检索"为什么"没产出，并据此切换 system prompt 与日志。
 *
 * 错误处理：
 *   - 超时 → "timeout"（[METRIC] vector.search.timeout）
 *   - 其他 throw → "api-error"（[METRIC] vector.search.api_error，保留原 error）
 *   - 无结果或被阈值过滤完 → "no-docs"
 */
export async function getRelevantContext(
  query: string,
  requestId: string,
): Promise<VectorSearchResult> {
  const log = logger.child({ scope: "chat.retrieve", requestId });

  if (!ASTRA_DB_COLLECTION || !query) {
    log.debug("跳过：缺少 collection 或 query");
    return { kind: "no-docs" };
  }

  // 把 timer id 提到 try 外面：无论 race 胜出方是谁，finally 都能 clearTimeout，
  // 避免请求结束后 timer 仍在事件循环里挂着、最终 reject 出未处理的 Promise。
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    log.debug("开始检索", { query });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Vector search timeout")),
        VECTOR_SEARCH_TIMEOUT_MS,
      );
    });

    const searchPromise: Promise<VectorSearchResult> = (async () => {
      const collection = getDb().collection(ASTRA_DB_COLLECTION);

      // 先查缓存：命中省掉 1-3s embedding API 调用。
      // key 用 trim 后的原 query，不做大小写归一化（embedding 对大小写敏感）。
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

      const sourceType = detectQuerySource(query);
      log.debug("检测到数据源类型", { sourceType });

      const filter = sourceType === "all" ? {} : { source: sourceType };
      const limit = sourceType === "prompt-suggestion" ? 5 : 3;

      log.debug("查询参数", { filter, limit });

      const cursor = collection.find(filter, {
        sort: { $vector: vector },
        limit,
        includeSimilarity: true,
        projection: {
          content: 1,
          source: 1,
          category: 1,
          title: 1,
          keywords: 1,
          _id: 0,
        },
      });

      const docs = (await cursor.toArray()) as RetrievedDoc[];
      log.debug("找到文档", {
        count: docs.length,
        // 把每个文档的关键信息压成一个小对象数组而不是逐行打 log，
        // 一次 log 就够过滤分析，不再炸日志。
        hits: docs.map((d) => ({
          similarity: d.$similarity,
          title: d.title,
          source: d.source,
        })),
      });

      const similarityThreshold = sourceType === "prompt-suggestion" ? 0.55 : 0.65;

      const relevantDocs = docs.filter(
        (doc) => (doc.$similarity || 0) >= similarityThreshold,
      );
      log.debug("阈值过滤", {
        similarityThreshold,
        kept: relevantDocs.length,
      });

      if (relevantDocs.length === 0) {
        return { kind: "no-docs" } as const;
      }

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
    // 无论 race 由 search 先 resolve / timer 先 reject，还是 catch 走完，
    // 都要 clearTimeout：否则 search 成功后 timer 仍会到点 reject，导致
    // 一个无人 await 的拒绝 Promise 触发 "unhandledRejection"。
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}
