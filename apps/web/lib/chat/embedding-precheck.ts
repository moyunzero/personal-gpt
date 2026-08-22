import { DEFAULT_WORKSPACE_ID } from "@personal-gpt/shared/constants/workspace";
import { createVectorStoreFromEnv } from "@personal-gpt/shared/stores/vector-store.factory";

import { logger } from "@/lib/logger";

import type { Corpus } from "@personal-gpt/shared";

import { routePrecheckFilter } from "./corpus-filters";
import { embedQueryText } from "./embedding-service";
import { ROUTE_DIRECT_SIMILARITY, ROUTE_RETRIEVE_SIMILARITY } from "./rag-options";

export interface EmbeddingPrecheckResult {
  topSimilarity: number;
  title?: string;
  probed: boolean;
}

/**
 * 路由前探测：query embedding + Top-1 相似度，判断知识库是否可能有相关内容。
 * 对齐 roadmap「embedding 相似度预检 + LLM 二分类」的第一层。
 */
export async function probeKbRelevance(
  query: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
  requestId?: string,
  corpus: Corpus = "user",
): Promise<EmbeddingPrecheckResult> {
  const log = logger.child({ scope: "chat.embedding-precheck", requestId });

  try {
    const vector = await embedQueryText(query, log);
    if (!vector) {
      log.warn("embedding 预检失败，跳过探测");
      return { topSimilarity: 0, probed: false };
    }

    const vectorStore = createVectorStoreFromEnv({ corpus });
    const hits = await vectorStore.search({
      workspaceId,
      vector,
      limit: 1,
      similarityThreshold: 0,
      filter: routePrecheckFilter(corpus),
    });

    const top = hits[0];
    const topSimilarity = top?.similarity ?? 0;

    log.debug("embedding 预检完成", {
      topSimilarity,
      title: top?.title,
      retrieveAt: ROUTE_RETRIEVE_SIMILARITY,
      directBelow: ROUTE_DIRECT_SIMILARITY,
    });

    return {
      topSimilarity,
      title: top?.title,
      probed: true,
    };
  } catch (error) {
    log.warn("embedding 预检异常，跳过探测（fail-open）", {
      err: error instanceof Error ? error.message : String(error),
    });
    return { topSimilarity: 0, probed: false };
  }
}

export function precheckSuggestsRetrieve(result: EmbeddingPrecheckResult): boolean {
  return result.probed && result.topSimilarity >= ROUTE_RETRIEVE_SIMILARITY;
}

export function precheckSuggestsDirect(result: EmbeddingPrecheckResult): boolean {
  return result.probed && result.topSimilarity < ROUTE_DIRECT_SIMILARITY;
}
