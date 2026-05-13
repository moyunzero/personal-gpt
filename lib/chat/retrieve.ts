import { DataAPIClient } from "@datastax/astra-db-ts";
import OpenAI from "openai";

import { env } from "@/lib/env";

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
  if (!ASTRA_DB_COLLECTION || !query) {
    console.log(`[chat][${requestId}] [Vector Search] 跳过：缺少 collection 或 query`);
    return { kind: "no-docs" };
  }

  try {
    console.log(`[chat][${requestId}] [Vector Search] 开始检索:`, query);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
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
        console.log(`[METRIC] embedding.cache.hit`, {
          requestId,
          cacheSize: embeddingCache.size(),
        });
      } else {
        console.log(`[METRIC] embedding.cache.miss`, {
          requestId,
          cacheSize: embeddingCache.size(),
        });
        console.log(`[chat][${requestId}] [Vector Search] 生成 embedding...`);
        const embeddings = await openRouterClient.embeddings.create({
          model: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
          input: query,
          encoding_format: "float",
        });

        vector = embeddings.data[0]?.embedding;
        if (!vector) {
          console.log(`[chat][${requestId}] [Vector Search] embedding 生成失败`);
          return { kind: "no-docs" } as const;
        }
        embeddingCache.set(cacheKey, vector);
      }

      const sourceType = detectQuerySource(query);
      console.log(
        `[chat][${requestId}] [Vector Search] 检测到数据源类型:`,
        sourceType,
      );

      const filter = sourceType === "all" ? {} : { source: sourceType };
      const limit = sourceType === "prompt-suggestion" ? 5 : 3;

      console.log(`[chat][${requestId}] [Vector Search] 查询参数:`, {
        filter,
        limit,
      });

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
      console.log(
        `[chat][${requestId}] [Vector Search] 找到文档数量:`,
        docs.length,
      );
      docs.forEach((doc, i) => {
        console.log(
          `[chat][${requestId}] [Vector Search] 文档 ${i + 1}: 相似度=${doc.$similarity?.toFixed(3)}, 标题=${doc.title}, 来源=${doc.source}`,
        );
      });

      const similarityThreshold = sourceType === "prompt-suggestion" ? 0.55 : 0.65;
      console.log(
        `[chat][${requestId}] [Vector Search] 相似度阈值:`,
        similarityThreshold,
      );

      const relevantDocs = docs.filter(
        (doc) => (doc.$similarity || 0) >= similarityThreshold,
      );
      console.log(
        `[chat][${requestId}] [Vector Search] 过滤后文档数量:`,
        relevantDocs.length,
      );

      if (relevantDocs.length === 0) {
        return { kind: "no-docs" } as const;
      }

      const blocks = formatContextBlocks(relevantDocs);
      const sources = Array.from(
        new Set(relevantDocs.map((doc) => doc.source ?? "unknown")),
      );

      console.log(
        `[chat][${requestId}] [Vector Search] 返回上下文长度:`,
        blocks.length,
      );

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
      // [METRIC] 前缀方便日后接 metrics 客户端按文本聚合；现在先 grep 友好。
      console.warn(`[METRIC] vector.search.timeout`, {
        requestId,
        queryLength: query.length,
      });
      return { kind: "timeout" };
    }

    console.error(`[METRIC] vector.search.api_error`, {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: "api-error", error };
  }
}
