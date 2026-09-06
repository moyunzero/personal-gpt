import type { Corpus } from "@personal-gpt/shared";
import {
  createAstraRelayVectorStore,
  createAstraRedisRelayVectorStore,
  isAstraRelayConfigured,
  isEsConfigured,
  shouldUseAstraRedisRelay,
} from "@personal-gpt/shared";
import type { ChunkRecord } from "@personal-gpt/shared/stores/vector-store";
import { shouldWriteAstra, shouldWriteMilvus } from "@personal-gpt/shared/stores/vector-store";
import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import { createMilvusVectorStore } from "@personal-gpt/shared/stores/vector-store.milvus";

import { upsertChunksToEs } from "./es-upsert";

/**
 * Dual-write: primary vector backend then ES index (D-09).
 * CloudBase→Astra 403：配置 relay 后优先 Redis 中继（Vercel 消费），否则 HTTP 中继。
 */
export async function upsertChunks(chunks: ChunkRecord[], corpus: Corpus = "user"): Promise<void> {
  if (chunks.length === 0) return;

  if (shouldWriteAstra()) {
    if (!isAstraRelayConfigured()) {
      await createAstraVectorStore({ corpus }).upsert(chunks);
    } else if (shouldUseAstraRedisRelay()) {
      await createAstraRedisRelayVectorStore({ corpus }).upsert(chunks);
    } else {
      await createAstraRelayVectorStore({ corpus }).upsert(chunks);
    }
  }
  if (shouldWriteMilvus()) {
    await createMilvusVectorStore({ corpus }).upsert(chunks);
  }

  if (isEsConfigured()) {
    await upsertChunksToEs(chunks, corpus);
  }
}
