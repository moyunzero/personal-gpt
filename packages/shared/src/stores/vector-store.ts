/**
 * VectorStore 抽象：业务层唯一向量读写入口（D-00d）。
 * Astra 具体实现见 vector-store.astra.ts。
 */

export interface ChunkRecord {
  workspaceId: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  vector: number[];
  title?: string;
  source?: string;
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface RetrievedChunk {
  text: string;
  similarity: number;
  title?: string;
  source?: string;
  category?: string;
  documentId?: string;
  chunkIndex?: number;
  keywords?: string[];
}

export interface VectorSearchParams {
  workspaceId: string;
  vector: number[];
  limit?: number;
  similarityThreshold?: number;
}

export interface VectorStore {
  upsert(chunks: ChunkRecord[]): Promise<void>;
  deleteByDocument(workspaceId: string, documentId: string): Promise<void>;
  search(params: VectorSearchParams): Promise<RetrievedChunk[]>;
}

export { createAstraVectorStore, createVectorStore } from "./vector-store.astra";
