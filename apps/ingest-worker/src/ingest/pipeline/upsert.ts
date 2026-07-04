import { createAstraVectorStore } from "../../../../../packages/shared/src/stores/vector-store.astra";
import type { ChunkRecord } from "../../../../../packages/shared/src/stores/vector-store";

/**
 * 经 VectorStore 抽象 upsert chunks（每条须含 workspaceId，由 assertChunkWorkspaceId 校验）。
 */
export async function upsertChunks(chunks: ChunkRecord[]): Promise<void> {
  if (chunks.length === 0) return;
  const store = createAstraVectorStore();
  await store.upsert(chunks);
}
