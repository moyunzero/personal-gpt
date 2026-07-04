import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { INGEST_CHUNK_DEFAULTS } from "../../../../../packages/shared/src/utils/ingest";
import type { ChunkRecord } from "../../../../../packages/shared/src/stores/vector-store";

export async function splitText(text: string): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: INGEST_CHUNK_DEFAULTS.chunkSize,
    chunkOverlap: INGEST_CHUNK_DEFAULTS.chunkOverlap,
  });
  return splitter.splitText(text);
}

export interface ChunkRecordMeta {
  workspaceId: string;
  documentId: string;
  title?: string;
  source?: string;
  category?: string;
  tags?: string[];
}

/**
 * 将切块与 embedding 向量映射为 VectorStore upsert 记录（DATA-02：每条含 workspaceId）。
 */
export function toChunkRecords(
  chunks: string[],
  vectors: number[][],
  meta: ChunkRecordMeta,
): ChunkRecord[] {
  if (chunks.length !== vectors.length) {
    throw new Error(`chunks/vectors length mismatch: ${chunks.length} vs ${vectors.length}`);
  }
  if (!meta.workspaceId?.trim()) {
    throw new Error("toChunkRecords requires workspaceId");
  }
  if (!meta.documentId?.trim()) {
    throw new Error("toChunkRecords requires documentId");
  }

  return chunks.map((text, chunkIndex) => ({
    workspaceId: meta.workspaceId,
    documentId: meta.documentId,
    chunkIndex,
    text,
    vector: vectors[chunkIndex]!,
    title: meta.title,
    source: meta.source,
    category: meta.category,
    tags: meta.tags,
  }));
}
