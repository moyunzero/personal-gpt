import { DataAPIClient } from "@datastax/astra-db-ts";

import type { Corpus } from "../rag/corpus";
import { resolveCorpusTargets } from "../rag/corpus";
import type { ChunkRecord, RetrievedChunk, VectorSearchParams, VectorStore } from "./vector-store";

export interface AstraCollectionHandle {
  find: (
    filter: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => { toArray: () => Promise<unknown[]> };
  insertOne: (doc: Record<string, unknown>) => Promise<unknown>;
  insertMany: (docs: Record<string, unknown>[]) => Promise<unknown>;
  deleteMany: (filter: Record<string, unknown>) => Promise<{ deletedCount?: number }>;
}

export function assertSearchWorkspaceId(
  workspaceId: string | undefined,
): asserts workspaceId is string {
  if (!workspaceId?.trim()) {
    throw new Error("VectorStore.search requires workspaceId");
  }
}

export function assertChunkWorkspaceId(chunk: ChunkRecord): void {
  if (!chunk.workspaceId?.trim()) {
    throw new Error("VectorStore.upsert requires workspaceId on every chunk");
  }
}

export interface AstraVectorStoreOptions {
  collection?: AstraCollectionHandle;
  /** Explicit collection; wins over corpus / env resolution */
  collectionName?: string;
  /**
   * Physical corpus target (D-24). Default "user".
   * resolveCorpusTargets prefers ASTRA_DB_COLLECTION_USER/SEED when set;
   * falls back to ASTRA_DB_COLLECTION (legacy mixed) until migrate-corpus-split (D-26).
   */
  corpus?: Corpus;
  endpoint?: string;
  token?: string;
}

/** Resolve Astra collection name: explicit > corpus targets > legacy env. */
export function resolveAstraCollectionName(
  options: Pick<AstraVectorStoreOptions, "collectionName" | "corpus"> = {},
): string {
  if (options.collectionName?.trim()) {
    return options.collectionName.trim();
  }
  return resolveCorpusTargets(options.corpus ?? "user").astraCollection;
}

function mapAstraDoc(doc: Record<string, unknown>): RetrievedChunk {
  return {
    text: String(doc.content ?? doc.text ?? ""),
    similarity: Number(doc.$similarity ?? 0),
    title: doc.title as string | undefined,
    source: doc.source as string | undefined,
    category: doc.category as string | undefined,
    documentId: doc.documentId as string | undefined,
    chunkIndex: doc.chunkIndex as number | undefined,
    keywords: doc.keywords as string[] | undefined,
  };
}

export function createAstraVectorStore(options: AstraVectorStoreOptions = {}): VectorStore {
  let collection = options.collection;

  if (!collection) {
    const collectionName = resolveAstraCollectionName(options);
    const endpoint = options.endpoint ?? process.env.ASTRA_DB_API_ENDPOINT;
    const token = options.token ?? process.env.ASTRA_DB_APPLICATION_TOKEN;

    if (!collectionName || !endpoint || !token) {
      throw new Error("Astra VectorStore requires collection, endpoint, and token");
    }

    const client = new DataAPIClient(token);
    const db = client.db(endpoint, { token });
    collection = db.collection(collectionName) as unknown as AstraCollectionHandle;
  }

  return {
    async upsert(chunks) {
      if (chunks.length === 0) return;

      for (const chunk of chunks) {
        assertChunkWorkspaceId(chunk);
      }

      const workspaceId = chunks[0]!.workspaceId;
      const documentIds = [...new Set(chunks.map((chunk) => chunk.documentId))];

      // 重索引幂等：先删同文档旧 chunk，再逐条 insertOne（insertMany 不会进入 Astra ANN 索引）
      for (const documentId of documentIds) {
        await collection!.deleteMany({
          workspaceId: { $eq: workspaceId },
          documentId,
        });
      }

      try {
        for (const chunk of chunks) {
          const payload = {
            $vector: chunk.vector,
            content: chunk.text,
            workspaceId: chunk.workspaceId,
            documentId: chunk.documentId,
            chunkIndex: chunk.chunkIndex,
            title: chunk.title,
            source: chunk.source,
            category: chunk.category,
            tags: chunk.tags,
            ...chunk.metadata,
          };
          await collection!.insertOne(payload);
        }
      } catch (error) {
        for (const documentId of documentIds) {
          await collection!.deleteMany({
            workspaceId: { $eq: workspaceId },
            documentId,
          });
        }
        throw error;
      }
    },

    async deleteByDocument(workspaceId, documentId) {
      assertSearchWorkspaceId(workspaceId);
      await collection!.deleteMany({ workspaceId: { $eq: workspaceId }, documentId });
    },

    async search(params: VectorSearchParams) {
      assertSearchWorkspaceId(params.workspaceId);

      const limit = params.limit ?? 5;
      const searchOptions = {
        sort: { $vector: params.vector },
        limit,
        includeSimilarity: true,
        projection: {
          content: 1,
          source: 1,
          category: 1,
          title: 1,
          keywords: 1,
          documentId: 1,
          chunkIndex: 1,
          _id: 0,
        },
      };

      const workspaceFilter = { workspaceId: { $eq: params.workspaceId } };
      const filter = params.filter ? { $and: [workspaceFilter, params.filter] } : workspaceFilter;

      // Phase 1 多租户隔离：先按 workspaceId（+ 可选 filter）过滤
      let docs = (await collection!.find(filter, searchOptions).toArray()) as Record<
        string,
        unknown
      >[];

      // v0.1 写入的 chunk 无 workspaceId 字段；仅 ASTRA_LEGACY_FALLBACK=true 时回退
      const legacyFallback = process.env.ASTRA_LEGACY_FALLBACK === "true";
      if (docs.length === 0 && !params.filter && legacyFallback) {
        docs = (await collection!.find({}, searchOptions).toArray()) as Record<string, unknown>[];
      }

      const threshold = params.similarityThreshold ?? 0;

      return docs.map(mapAstraDoc).filter((doc) => doc.similarity >= threshold);
    },
  };
}

/**
 * 进程内默认 VectorStore 工厂（Astra 实现）。
 * Default corpus=user (D-27); pass corpus:"seed" for seed collection.
 * Chat retrieve call sites unchanged until plan 03-03.
 */
export function createVectorStore(
  options: Pick<AstraVectorStoreOptions, "corpus" | "collectionName"> = {},
): VectorStore {
  return createAstraVectorStore(options);
}
