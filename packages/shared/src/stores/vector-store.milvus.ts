/**
 * Milvus VectorStore（Wave3 STORE-01）：与 Astra 同接口；search/upsert 强制 workspaceId。
 */

import { DataType, IndexType, MetricType, MilvusClient } from "@zilliz/milvus2-sdk-node";

import { EMBEDDING_DIMENSION } from "../ai/embedding-models";
import type { Corpus } from "../rag/corpus";
import { resolveCorpusTargets } from "../rag/corpus";
import { assertChunkWorkspaceId, assertSearchWorkspaceId } from "./vector-store.astra";
import type { RetrievedChunk, VectorSearchParams, VectorStore } from "./vector-store";

/** Minimal client surface for tests / injection. */
export interface MilvusClientLike {
  connectPromise?: Promise<unknown>;
  hasCollection: (params: { collection_name: string }) => Promise<{ value?: boolean } | boolean>;
  createCollection: (params: Record<string, unknown>) => Promise<unknown>;
  createIndex: (params: Record<string, unknown>) => Promise<unknown>;
  loadCollection: (params: { collection_name: string }) => Promise<unknown>;
  insert: (params: {
    collection_name: string;
    data: Record<string, unknown>[];
  }) => Promise<unknown>;
  upsert?: (params: {
    collection_name: string;
    data: Record<string, unknown>[];
  }) => Promise<unknown>;
  delete: (params: { collection_name: string; filter: string }) => Promise<unknown>;
  search: (params: Record<string, unknown>) => Promise<{
    results: Array<Record<string, unknown> & { score?: number }>;
  }>;
}

export interface MilvusVectorStoreOptions {
  client?: MilvusClientLike;
  address?: string;
  /** Explicit collection; wins over corpus / env resolution */
  collectionName?: string;
  corpus?: Corpus;
  /** Vector dim; default NIM 2048 */
  dim?: number;
  /** Skip ensureCollection (tests with pre-wired mock) */
  skipEnsure?: boolean;
}

function escapeMilvusString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function resolveMilvusCollectionName(
  options: Pick<MilvusVectorStoreOptions, "collectionName" | "corpus"> = {},
): string {
  if (options.collectionName?.trim()) {
    return options.collectionName.trim();
  }
  const corpus = options.corpus ?? "user";
  if (corpus === "seed") {
    return (
      process.env.MILVUS_COLLECTION_SEED?.trim() || resolveCorpusTargets("seed").astraCollection
    );
  }
  return process.env.MILVUS_COLLECTION_USER?.trim() || resolveCorpusTargets("user").astraCollection;
}

function chunkPrimaryKey(documentId: string, chunkIndex: number): string {
  return `${documentId}#${chunkIndex}`;
}

function normalizeMilvusCosineScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score <= -1) return 0;
  if (score >= 1) return 1;
  return (score + 1) / 2;
}

function mapMilvusHit(hit: Record<string, unknown> & { score?: number }): RetrievedChunk {
  return {
    text: String(hit.content ?? hit.text ?? ""),
    similarity: normalizeMilvusCosineScore(Number(hit.score ?? 0)),
    title: hit.title as string | undefined,
    source: hit.source as string | undefined,
    category: hit.category as string | undefined,
    documentId: hit.documentId as string | undefined,
    chunkIndex: hit.chunkIndex as number | undefined,
  };
}

function hasCollectionValue(result: { value?: boolean } | boolean): boolean {
  if (typeof result === "boolean") return result;
  return Boolean(result?.value);
}

export function createMilvusVectorStore(options: MilvusVectorStoreOptions = {}): VectorStore {
  const collectionName = resolveMilvusCollectionName(options);
  const dim = options.dim ?? EMBEDDING_DIMENSION;
  const address = options.address ?? process.env.MILVUS_ADDRESS ?? "localhost:19530";

  const client: MilvusClientLike =
    options.client ?? (new MilvusClient({ address }) as unknown as MilvusClientLike);

  let ensured = Boolean(options.skipEnsure);
  let ensurePromise: Promise<void> | null = null;

  async function ensureCollection(): Promise<void> {
    if (ensured) return;
    if (ensurePromise) {
      await ensurePromise;
      return;
    }
    ensurePromise = (async () => {
      if (client.connectPromise) {
        await client.connectPromise;
      }
      const exists = hasCollectionValue(
        await client.hasCollection({ collection_name: collectionName }),
      );
      if (!exists) {
        await client.createCollection({
          collection_name: collectionName,
          fields: [
            {
              name: "id",
              data_type: DataType.VarChar,
              max_length: 256,
              is_primary_key: true,
            },
            { name: "vector", data_type: DataType.FloatVector, dim },
            { name: "content", data_type: DataType.VarChar, max_length: 65535 },
            { name: "workspaceId", data_type: DataType.VarChar, max_length: 64 },
            { name: "documentId", data_type: DataType.VarChar, max_length: 256 },
            { name: "chunkIndex", data_type: DataType.Int64 },
            { name: "title", data_type: DataType.VarChar, max_length: 512 },
            { name: "source", data_type: DataType.VarChar, max_length: 1024 },
            { name: "category", data_type: DataType.VarChar, max_length: 256 },
          ],
        });
        await client.createIndex({
          collection_name: collectionName,
          field_name: "vector",
          index_type: IndexType.IVF_FLAT,
          metric_type: MetricType.COSINE,
          params: { nlist: 128 },
        });
      }
      await client.loadCollection({ collection_name: collectionName });
      ensured = true;
    })();
    try {
      await ensurePromise;
    } finally {
      ensurePromise = null;
    }
  }

  return {
    async upsert(chunks) {
      if (chunks.length === 0) return;
      for (const chunk of chunks) {
        assertChunkWorkspaceId(chunk);
      }
      await ensureCollection();

      const workspaceId = chunks[0]!.workspaceId;
      const byDocument = new Map<string, typeof chunks>();
      for (const chunk of chunks) {
        const list = byDocument.get(chunk.documentId) ?? [];
        list.push(chunk);
        byDocument.set(chunk.documentId, list);
      }

      for (const [documentId, docChunks] of byDocument) {
        const data = docChunks.map((chunk) => ({
          id: chunkPrimaryKey(chunk.documentId, chunk.chunkIndex),
          vector: chunk.vector,
          content: chunk.text,
          workspaceId: chunk.workspaceId,
          documentId: chunk.documentId,
          chunkIndex: chunk.chunkIndex,
          title: chunk.title ?? "",
          source: chunk.source ?? "",
          category: chunk.category ?? "",
        }));
        const write = client.upsert ?? client.insert;
        await write({ collection_name: collectionName, data });

        const maxChunkIndex = Math.max(...docChunks.map((c) => c.chunkIndex));
        await client.delete({
          collection_name: collectionName,
          filter: `workspaceId == "${escapeMilvusString(workspaceId)}" && documentId == "${escapeMilvusString(documentId)}" && chunkIndex > ${maxChunkIndex}`,
        });
      }
    },

    async deleteByDocument(workspaceId, documentId) {
      assertSearchWorkspaceId(workspaceId);
      await ensureCollection();
      await client.delete({
        collection_name: collectionName,
        filter: `workspaceId == "${escapeMilvusString(workspaceId)}" && documentId == "${escapeMilvusString(documentId)}"`,
      });
    },

    async search(params: VectorSearchParams) {
      assertSearchWorkspaceId(params.workspaceId);
      await ensureCollection();

      const limit = params.limit ?? 5;
      let filter = `workspaceId == "${escapeMilvusString(params.workspaceId)}"`;
      if (params.documentIds?.length) {
        const ids = params.documentIds
          .map((id) => `"${escapeMilvusString(id)}"`)
          .join(", ");
        filter += ` && documentId in [${ids}]`;
      }

      const result = await client.search({
        collection_name: collectionName,
        data: [params.vector],
        limit,
        filter,
        metric_type: MetricType.COSINE,
        consistency_level: "Strong",
        output_fields: [
          "content",
          "title",
          "source",
          "category",
          "documentId",
          "chunkIndex",
          "workspaceId",
        ],
      });

      const threshold = params.similarityThreshold ?? 0;
      return (result.results ?? []).map(mapMilvusHit).filter((doc) => doc.similarity >= threshold);
    },
  };
}
