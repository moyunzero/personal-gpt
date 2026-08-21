import type { Corpus } from "@personal-gpt/shared";
import type { ChunkRecord } from "@personal-gpt/shared/stores/vector-store";
import {
  shouldWriteAstra,
  shouldWriteMilvus,
} from "@personal-gpt/shared/stores/vector-store";
import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import { createMilvusVectorStore } from "@personal-gpt/shared/stores/vector-store.milvus";

import { upsertChunksToEs } from "./es-upsert";

/**
 * Dual-write: primary vector backend then ES index (D-09).
 * VECTOR_BACKEND=astra (default) | milvus; optional MILVUS_DUAL_WRITE when Astra primary.
 * ES errors throw so BullMQ marks the job failed and retries (D-10).
 */
export async function upsertChunks(
  chunks: ChunkRecord[],
  corpus: Corpus = "user",
): Promise<void> {
  if (chunks.length === 0) return;

  if (shouldWriteAstra()) {
    await createAstraVectorStore({ corpus }).upsert(chunks);
  }
  if (shouldWriteMilvus()) {
    await createMilvusVectorStore({ corpus }).upsert(chunks);
  }

  await upsertChunksToEs(chunks, corpus);
}
