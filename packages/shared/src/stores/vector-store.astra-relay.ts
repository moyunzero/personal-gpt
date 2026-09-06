/**
 * Astra VectorStore HTTP relay：CloudBase（CN）直连 Astra 常 403 时，
 * 经 VECTOR_ASTRA_RELAY_URL（通常为 Vercel 美区）转发 upsert/delete/search。
 */
import type { Corpus } from "../rag/corpus";
import type { ChunkRecord, RetrievedChunk, VectorSearchParams, VectorStore } from "./vector-store";
import { assertChunkWorkspaceId, assertSearchWorkspaceId } from "./vector-store.astra";

export type AstraRelayEnv = {
  VECTOR_ASTRA_RELAY_URL?: string;
  INTERNAL_PROXY_KEY?: string;
};

/** True when both relay base URL and shared secret are configured. */
export function isAstraRelayConfigured(
  source: NodeJS.ProcessEnv | AstraRelayEnv = process.env,
): boolean {
  return Boolean(source.VECTOR_ASTRA_RELAY_URL?.trim() && source.INTERNAL_PROXY_KEY?.trim());
}

function relayBase(source: NodeJS.ProcessEnv | AstraRelayEnv): string {
  return source.VECTOR_ASTRA_RELAY_URL!.trim().replace(/\/$/, "");
}

function relayKey(source: NodeJS.ProcessEnv | AstraRelayEnv): string {
  return source.INTERNAL_PROXY_KEY!.trim();
}

async function relayFetch(
  path: string,
  body: unknown,
  source: NodeJS.ProcessEnv | AstraRelayEnv = process.env,
): Promise<Response> {
  const res = await fetch(`${relayBase(source)}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-proxy-key": relayKey(source),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Astra relay ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res;
}

export type CreateAstraRelayStoreOptions = {
  corpus?: Corpus;
  collectionName?: string;
  env?: AstraRelayEnv;
  fetchImpl?: typeof fetch;
};

/**
 * HTTP-backed VectorStore that mirrors createAstraVectorStore ops via Vercel relay.
 */
export function createAstraRelayVectorStore(
  options: CreateAstraRelayStoreOptions = {},
): VectorStore {
  const env = options.env ?? process.env;
  if (!isAstraRelayConfigured(env)) {
    throw new Error("Astra relay requires VECTOR_ASTRA_RELAY_URL and INTERNAL_PROXY_KEY");
  }

  const corpus = options.corpus ?? "user";
  const collectionName = options.collectionName?.trim() || undefined;

  return {
    async upsert(chunks) {
      if (chunks.length === 0) return;
      for (const chunk of chunks) {
        assertChunkWorkspaceId(chunk);
      }
      await relayFetch("/api/internal/vector/upsert", { corpus, collectionName, chunks }, env);
    },

    async deleteByDocument(workspaceId, documentId) {
      assertSearchWorkspaceId(workspaceId);
      await relayFetch(
        "/api/internal/vector/delete",
        { corpus, collectionName, workspaceId, documentId },
        env,
      );
    },

    async search(params: VectorSearchParams): Promise<RetrievedChunk[]> {
      assertSearchWorkspaceId(params.workspaceId);
      const res = await relayFetch(
        "/api/internal/vector/search",
        { corpus, collectionName, params },
        env,
      );
      const json = (await res.json()) as { chunks?: RetrievedChunk[] };
      return Array.isArray(json.chunks) ? json.chunks : [];
    },
  };
}
