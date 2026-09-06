import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import type { ChunkRecord } from "@personal-gpt/shared/stores/vector-store";
import type { Corpus } from "@personal-gpt/shared";

import { isTrustedInternalProxy } from "@/lib/internal-proxy-auth";

export const runtime = "nodejs";

type UpsertBody = {
  corpus?: Corpus;
  collectionName?: string;
  chunks?: ChunkRecord[];
};

/**
 * CloudBase ingest/agent → Vercel → Astra upsert relay.
 * Auth: x-internal-proxy-key === INTERNAL_PROXY_KEY
 */
export async function POST(req: Request) {
  if (!isTrustedInternalProxy(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const chunks = body.chunks;
  if (!Array.isArray(chunks)) {
    return Response.json({ error: "chunks_required" }, { status: 400 });
  }

  await createAstraVectorStore({
    corpus: body.corpus ?? "user",
    collectionName: body.collectionName,
  }).upsert(chunks);

  return Response.json({ ok: true, count: chunks.length });
}
