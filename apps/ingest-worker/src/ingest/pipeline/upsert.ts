import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import type { Corpus } from "@personal-gpt/shared";
import type { ChunkRecord } from "@personal-gpt/shared/stores/vector-store";

import { upsertChunksToEs } from "./es-upsert";

/**
 * Dual-write: Astra corpus collection then ES index (D-09).
 * ES errors throw so BullMQ marks the job failed and retries (D-10).
 * User uploads default corpus=user; seed scripts pass corpus=seed.
 */
export async function upsertChunks(
  chunks: ChunkRecord[],
  corpus: Corpus = "user",
): Promise<void> {
  if (chunks.length === 0) return;
  const store = createAstraVectorStore({ corpus });
  await store.upsert(chunks);
  await upsertChunksToEs(chunks, corpus);
}
