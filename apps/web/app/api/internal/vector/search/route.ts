import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import type { VectorSearchParams } from "@personal-gpt/shared/stores/vector-store";
import type { Corpus } from "@personal-gpt/shared";

import { isTrustedInternalProxy } from "@/lib/internal-proxy-auth";
import {
  assertInternalVectorContentLength,
  assertNoCustomCollectionName,
  checkInternalProxyRateLimit,
  isUuid,
} from "@/lib/internal-vector-guard";

export const runtime = "nodejs";

type SearchBody = {
  corpus?: Corpus;
  collectionName?: string;
  params?: VectorSearchParams;
};

/**
 * CloudBase agent → Vercel → Astra search relay.
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

  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const coll = assertNoCustomCollectionName(body.collectionName);
  if (!coll.ok) return Response.json({ error: coll.error }, { status: coll.status });

  if (!body.params?.workspaceId || !Array.isArray(body.params.vector)) {
    return Response.json({ error: "params_required" }, { status: 400 });
  }
  if (!isUuid(body.params.workspaceId)) {
    return Response.json({ error: "invalid_workspaceId" }, { status: 400 });
  }

  const chunks = await createAstraVectorStore({
    corpus: body.corpus ?? "user",
  }).search(body.params);

  return Response.json({ chunks });
}
