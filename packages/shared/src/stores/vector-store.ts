/**
 * VectorStore 抽象：业务层唯一向量读写入口（D-00d）。
 * Astra：vector-store.astra.ts；Milvus：vector-store.milvus.ts；工厂：vector-store.factory.ts。
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
  /** BM25 _score from ES — not comparable to cosine; kept separate for hybrid RRF. */
  bm25Score?: number;
  title?: string;
  source?: string;
  category?: string;
  documentId?: string;
  chunkIndex?: number;
  /** Dedicated reranker relevance score (distinct from vector cosine similarity). */
  rerankScore?: number;
  keywords?: string[];
}

export interface VectorSearchParams {
  workspaceId: string;
  vector: number[];
  limit?: number;
  similarityThreshold?: number;
  /** Astra find 附加过滤（与 workspaceId 以 $and 合并） */
  filter?: Record<string, unknown>;
}

export interface VectorStore {
  upsert(chunks: ChunkRecord[]): Promise<void>;
  deleteByDocument(workspaceId: string, documentId: string): Promise<void>;
  search(params: VectorSearchParams): Promise<RetrievedChunk[]>;
}

export {
  createAstraVectorStore,
  createVectorStore,
  resolveAstraCollectionName,
  type AstraVectorStoreOptions,
} from "./vector-store.astra";

export {
  createMilvusVectorStore,
  resolveMilvusCollectionName,
  type MilvusClientLike,
  type MilvusVectorStoreOptions,
} from "./vector-store.milvus";

export {
  createVectorStoreFromEnv,
  resolveVectorBackend,
  shouldWriteAstra,
  shouldWriteMilvus,
  type CreateVectorStoreFromEnvOptions,
  type VectorBackend,
} from "./vector-store.factory";
