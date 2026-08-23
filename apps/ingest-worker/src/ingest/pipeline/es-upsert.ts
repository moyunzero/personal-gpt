/**
 * Ingest ES dual-write helpers (D-09 / D-10).
 * Write failures must throw — callers never swallow (fail-closed).
 */
import {
  deleteByDocumentId,
  ensureEsIndexes,
  indexChunks,
  resolveCorpusTargets,
  type Corpus,
} from "@personal-gpt/shared";
import { assertChunkWorkspaceId } from "@personal-gpt/shared/stores/vector-store.astra";
import type { ChunkRecord } from "@personal-gpt/shared/stores/vector-store";

/** Idempotent: delete-by-documentId then bulk index into corpus ES index. */
export async function upsertChunksToEs(
  chunks: ChunkRecord[],
  corpus: Corpus = "user",
): Promise<void> {
  if (chunks.length === 0) return;

  for (const chunk of chunks) {
    assertChunkWorkspaceId(chunk);
  }
  const workspaceIds = new Set(chunks.map((c) => c.workspaceId));
  if (workspaceIds.size !== 1) {
    throw new Error("upsertChunksToEs requires all chunks to share the same workspaceId");
  }

  const { esIndex } = resolveCorpusTargets(corpus);
  await ensureEsIndexes([esIndex]);
  const workspaceId = chunks[0]!.workspaceId;
  const documentIds = [...new Set(chunks.map((c) => c.documentId))];

  for (const documentId of documentIds) {
    await deleteByDocumentId(esIndex, workspaceId, documentId);
  }

  await indexChunks(
    esIndex,
    chunks.map((chunk) => ({
      workspaceId: chunk.workspaceId,
      documentId: chunk.documentId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.text,
      title: chunk.title,
      source: chunk.source,
      category: chunk.category,
      keywords: chunk.tags,
    })),
  );
}

export async function deleteDocumentFromEs(
  workspaceId: string,
  documentId: string,
  corpus: Corpus = "user",
): Promise<void> {
  const { esIndex } = resolveCorpusTargets(corpus);
  await deleteByDocumentId(esIndex, workspaceId, documentId);
}
