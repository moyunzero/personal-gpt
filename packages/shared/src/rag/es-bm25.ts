import type { RetrievedChunk } from "../stores/vector-store";
import type { Corpus } from "./corpus";
import { resolveCorpusTargets } from "./corpus";
import { getEsClient } from "./es-client";

export interface EsChunkDoc {
  workspaceId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  title?: string;
  source?: string;
  category?: string;
  keywords?: string[];
}

export interface EsBm25SearchParams {
  query: string;
  workspaceId: string;
  corpus?: Corpus;
  limit?: number;
  index?: string;
}

const INDEX_SETTINGS = {
  analysis: {
    analyzer: {
      ik_smart_analyzer: {
        type: "custom",
        tokenizer: "ik_smart",
      },
    },
  },
} as const;

const INDEX_MAPPINGS = {
  properties: {
    workspaceId: { type: "keyword" },
    documentId: { type: "keyword" },
    chunkIndex: { type: "integer" },
    content: { type: "text", analyzer: "ik_smart_analyzer" },
    title: { type: "text", analyzer: "ik_smart_analyzer" },
    source: { type: "keyword" },
    category: { type: "keyword" },
    keywords: { type: "keyword" },
  },
} as const;

function chunkDocId(doc: Pick<EsChunkDoc, "documentId" | "chunkIndex">): string {
  return `${doc.documentId}:${doc.chunkIndex}`;
}

/** Ensure user + seed indexes exist (IK analyzer; Chinese-capable). */
export async function ensureEsIndexes(
  indexes: string[] = [
    resolveCorpusTargets("user").esIndex,
    resolveCorpusTargets("seed").esIndex,
  ],
): Promise<void> {
  const client = getEsClient();
  for (const index of indexes) {
    const exists = await client.indices.exists({ index });
    if (exists) continue;
    await client.indices.create({
      index,
      settings: INDEX_SETTINGS,
      mappings: INDEX_MAPPINGS,
    });
  }
}

/** Idempotent write helpers for ingest dual-write (plan 03-02). */
export async function indexChunks(
  index: string,
  chunks: EsChunkDoc[],
): Promise<void> {
  if (chunks.length === 0) return;
  const client = getEsClient();
  const operations = chunks.flatMap((chunk) => [
    { index: { _index: index, _id: chunkDocId(chunk) } },
    {
      workspaceId: chunk.workspaceId,
      documentId: chunk.documentId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      title: chunk.title,
      source: chunk.source,
      category: chunk.category,
      keywords: chunk.keywords,
    },
  ]);
  await client.bulk({ refresh: true, operations });
}

export async function deleteByDocumentId(
  index: string,
  workspaceId: string,
  documentId: string,
): Promise<void> {
  const client = getEsClient();
  await client.deleteByQuery({
    index,
    refresh: true,
    query: {
      bool: {
        filter: [
          { term: { workspaceId } },
          { term: { documentId } },
        ],
      },
    },
  });
}

function mapHit(hit: {
  _source?: Record<string, unknown>;
  _score?: number | null;
}): RetrievedChunk {
  const source = hit._source ?? {};
  return {
    text: String(source.content ?? ""),
    similarity: Number(hit._score ?? 0),
    title: source.title as string | undefined,
    source: source.source as string | undefined,
    category: source.category as string | undefined,
    documentId: source.documentId as string | undefined,
    chunkIndex: source.chunkIndex as number | undefined,
    keywords: source.keywords as string[] | undefined,
  };
}

/** BM25 search via structured client query (no string-concat injection). */
export async function esBm25Search(
  params: EsBm25SearchParams,
): Promise<RetrievedChunk[]> {
  const corpus = params.corpus ?? "user";
  const index = params.index ?? resolveCorpusTargets(corpus).esIndex;
  const limit = params.limit ?? 10;
  const client = getEsClient();

  const result = await client.search({
    index,
    size: limit,
    query: {
      bool: {
        filter: [{ term: { workspaceId: params.workspaceId } }],
        must: [
          {
            multi_match: {
              query: params.query,
              fields: ["title^2", "content"],
              type: "best_fields",
              analyzer: "ik_smart",
            },
          },
        ],
      },
    },
  });

  const hits = result.hits?.hits ?? [];
  return hits.map((hit) => mapHit(hit as { _source?: Record<string, unknown>; _score?: number | null }));
}
