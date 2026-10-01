import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import type { ChunkRecord } from "@personal-gpt/shared/stores/vector-store";
import type { Corpus } from "@personal-gpt/shared";

import { isTrustedInternalProxy } from "@/lib/internal-proxy-auth";
import {
  assertChunksPayload,
  assertInternalVectorContentLength,
  assertNoCustomCollectionName,
  checkInternalProxyRateLimit,
} from "@/lib/internal-vector-guard";

export const runtime = "nodejs";

type UpsertBody = {
  corpus?: Corpus;
  collectionName?: string;
  chunks?: ChunkRecord[];
};

/**
 * CloudBase ingest/agent → Vercel → Astra upsert relay.
 */
export async function POST(req: Request) {
  if (!isTrustedInternalProxy(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const proxyKey = req.headers.get("x-internal-proxy-key")?.trim() || "proxy";
  const rate = checkInternalProxyRateLimit(proxyKey);
  if (!rate.ok) return Response.json({ error: rate.error }, { status: rate.status });

  const size = assertInternalVectorContentLength(req);
  if (!size.ok) return Response.json({ error: size.error }, { status: size.status });

  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const coll = assertNoCustomCollectionName(body.collectionName);
  if (!coll.ok) return Response.json({ error: coll.error }, { status: coll.status });

  const chunksCheck = assertChunksPayload(body.chunks);
  if (!chunksCheck.ok) {
    return Response.json({ error: chunksCheck.error }, { status: chunksCheck.status });
  }

  const chunks = body.chunks as ChunkRecord[];
  await createAstraVectorStore({
    corpus: body.corpus ?? "user",
  }).upsert(chunks);

  return Response.json({ ok: true, count: chunks.length });
}
