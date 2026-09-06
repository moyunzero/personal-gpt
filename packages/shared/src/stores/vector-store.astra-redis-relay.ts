/**
 * Astra relay over Redis（CloudBase 常无法直连 Vercel.app，但已能连 Upstash）。
 * ingest：LPUSH 请求并轮询 ack；Vercel cron/SSE：BRPOP 执行后 SET ack。
 */
import { randomUUID } from "node:crypto";
import Redis from "ioredis";

import type { Corpus } from "../rag/corpus";
import type { ChunkRecord, RetrievedChunk, VectorSearchParams, VectorStore } from "./vector-store";
import { assertChunkWorkspaceId, assertSearchWorkspaceId } from "./vector-store.astra";

const QUEUE_KEY = "pgpt:astra:relay:q";
const ackKey = (id: string) => `pgpt:astra:relay:ack:${id}`;

export type AstraRelayJob =
  | {
      id: string;
      op: "upsert";
      corpus: Corpus;
      collectionName?: string;
      chunks: ChunkRecord[];
    }
  | {
      id: string;
      op: "delete";
      corpus: Corpus;
      collectionName?: string;
      workspaceId: string;
      documentId: string;
    }
  | {
      id: string;
      op: "search";
      corpus: Corpus;
      collectionName?: string;
      params: VectorSearchParams;
    };

export type AstraRelayAck = { ok: true; chunks?: RetrievedChunk[] } | { ok: false; error: string };

let sharedRedis: Redis | null = null;

function getRelayRedis(): Redis {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new Error("Astra Redis relay requires REDIS_URL");
  }
  if (!sharedRedis) {
    sharedRedis = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }
  return sharedRedis;
}

/** Prefer Redis transport when REDIS_URL is set (CloudBase→Vercel HTTP often fails). */
export function shouldUseAstraRedisRelay(source: NodeJS.ProcessEnv = process.env): boolean {
  const mode = source.VECTOR_ASTRA_RELAY_TRANSPORT?.trim().toLowerCase();
  if (mode === "http") return false;
  if (mode === "redis") return Boolean(source.REDIS_URL?.trim());
  // default: redis when REDIS_URL present and relay is configured
  return Boolean(source.REDIS_URL?.trim());
}

async function enqueueAndWait(job: AstraRelayJob, timeoutMs = 90_000): Promise<AstraRelayAck> {
  const redis = getRelayRedis();
  await redis.lpush(QUEUE_KEY, JSON.stringify(job));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await redis.get(ackKey(job.id));
    if (raw) {
      await redis.del(ackKey(job.id));
      return JSON.parse(raw) as AstraRelayAck;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Astra Redis relay timeout waiting for ack (${job.op})`);
}

export function createAstraRedisRelayVectorStore(options: {
  corpus?: Corpus;
  collectionName?: string;
}): VectorStore {
  const corpus = options.corpus ?? "user";
  const collectionName = options.collectionName?.trim() || undefined;

  return {
    async upsert(chunks) {
      if (chunks.length === 0) return;
      for (const chunk of chunks) assertChunkWorkspaceId(chunk);
      const ack = await enqueueAndWait({
        id: randomUUID(),
        op: "upsert",
        corpus,
        collectionName,
        chunks,
      });
      if (!ack.ok) throw new Error(ack.error || "Astra Redis relay upsert failed");
    },

    async deleteByDocument(workspaceId, documentId) {
      assertSearchWorkspaceId(workspaceId);
      const ack = await enqueueAndWait({
        id: randomUUID(),
        op: "delete",
        corpus,
        collectionName,
        workspaceId,
        documentId,
      });
      if (!ack.ok) throw new Error(ack.error || "Astra Redis relay delete failed");
    },

    async search(params) {
      assertSearchWorkspaceId(params.workspaceId);
      const ack = await enqueueAndWait({
        id: randomUUID(),
        op: "search",
        corpus,
        collectionName,
        params,
      });
      if (!ack.ok) throw new Error(ack.error || "Astra Redis relay search failed");
      return ack.chunks ?? [];
    },
  };
}

export async function popAstraRelayJob(): Promise<AstraRelayJob | null> {
  const redis = getRelayRedis();
  const raw = await redis.rpop(QUEUE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as AstraRelayJob;
}

export async function ackAstraRelayJob(id: string, ack: AstraRelayAck): Promise<void> {
  const redis = getRelayRedis();
  await redis.set(ackKey(id), JSON.stringify(ack), "EX", 300);
}

export async function drainAstraRelayJobs(
  handler: (job: AstraRelayJob) => Promise<AstraRelayAck>,
  maxJobs = 20,
): Promise<number> {
  let n = 0;
  while (n < maxJobs) {
    const job = await popAstraRelayJob();
    if (!job) break;
    try {
      const ack = await handler(job);
      await ackAstraRelayJob(job.id, ack);
    } catch (err) {
      await ackAstraRelayJob(job.id, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    n += 1;
  }
  return n;
}
