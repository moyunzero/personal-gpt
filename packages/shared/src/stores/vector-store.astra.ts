import { DataAPIClient } from "@datastax/astra-db-ts";

import type { ChunkRecord, RetrievedChunk, VectorSearchParams, VectorStore } from "./vector-store";

export interface AstraCollectionHandle {
  find: (
    filter: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => { toArray: () => Promise<unknown[]> };
  insertMany: (docs: Record<string, unknown>[]) => Promise<unknown>;
  deleteMany: (filter: Record<string, unknown>) => Promise<{ deletedCount?: number }>;
}

export function assertSearchWorkspaceId(workspaceId: string | undefined): asserts workspaceId is string {
  if (!workspaceId?.trim()) {
    throw new Error("VectorStore.search requires workspaceId");
  }
}

export function assertChunkWorkspaceId(chunk: ChunkRecord): void {
  if (!chunk.workspaceId?.trim()) {
    throw new Error("VectorStore.upsert requires workspaceId on every chunk");
  }
}

interface AstraVectorStoreOptions {
  collection?: AstraCollectionHandle;
  collectionName?: string;
  endpoint?: string;
  token?: string;
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
    const collectionName = options.collectionName ?? process.env.ASTRA_DB_COLLECTION;
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

      const payloads = chunks.map((chunk) => {
        assertChunkWorkspaceId(chunk);
        return {
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
      });

      await collection!.insertMany(payloads);
    },

    async deleteByDocument(workspaceId, documentId) {
      assertSearchWorkspaceId(workspaceId);
      await collection!.deleteMany({ workspaceId: { $eq: workspaceId }, documentId });
    },

    async search(params: VectorSearchParams) {
      assertSearchWorkspaceId(params.workspaceId);

      const limit = params.limit ?? 5;
      const cursor = collection!.find(
        { workspaceId: { $eq: params.workspaceId } },
        {
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
        },
      );

      const docs = (await cursor.toArray()) as Record<string, unknown>[];
      const threshold = params.similarityThreshold ?? 0;

      return docs
        .map(mapAstraDoc)
        .filter((doc) => doc.similarity >= threshold);
    },
  };
}

/** 进程内默认 VectorStore 工厂（Astra 实现） */
export function createVectorStore(): VectorStore {
  return createAstraVectorStore({});
}
