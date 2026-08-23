/**
 * VectorStore 工厂：VECTOR_BACKEND=astra|milvus（默认 astra）。
 */

import type { Corpus } from "../rag/corpus";
import { resolveCorpusTargets } from "../rag/corpus";
import { createAstraVectorStore } from "./vector-store.astra";
import { createMilvusVectorStore } from "./vector-store.milvus";
import type { VectorStore } from "./vector-store";

export type VectorBackend = "astra" | "milvus";

export function resolveVectorBackend(source: NodeJS.ProcessEnv = process.env): VectorBackend {
  const raw = source.VECTOR_BACKEND?.trim().toLowerCase();
  return raw === "milvus" ? "milvus" : "astra";
}

export type CreateVectorStoreFromEnvOptions = {
  corpus?: Corpus;
  collectionName?: string;
};

/**
 * 按 VECTOR_BACKEND 创建 VectorStore。
 * hybridSearch / ingest 应走此入口，避免并行两套 API。
 */
export function createVectorStoreFromEnv(
  options: CreateVectorStoreFromEnvOptions = {},
): VectorStore {
  const corpus = options.corpus ?? "user";
  const backend = resolveVectorBackend();

  if (backend === "milvus") {
    return createMilvusVectorStore({
      corpus,
      collectionName: options.collectionName,
    });
  }

  const collectionName = options.collectionName ?? resolveCorpusTargets(corpus).astraCollection;
  return createAstraVectorStore({ corpus, collectionName });
}

/** True when ingest should also write Milvus (primary or dual-write). */
export function shouldWriteMilvus(source: NodeJS.ProcessEnv = process.env): boolean {
  return resolveVectorBackend(source) === "milvus" || source.MILVUS_DUAL_WRITE === "true";
}

/** True when ingest should write Astra (primary unless milvus-only). */
export function shouldWriteAstra(source: NodeJS.ProcessEnv = process.env): boolean {
  return resolveVectorBackend(source) !== "milvus";
}
