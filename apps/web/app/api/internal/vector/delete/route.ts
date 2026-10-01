import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import type { Corpus } from "@personal-gpt/shared";

import { isTrustedInternalProxy } from "@/lib/internal-proxy-auth";
import {
  assertInternalVectorContentLength,
  assertNoCustomCollectionName,
  checkInternalProxyRateLimit,
  isUuid,
} from "@/lib/internal-vector-guard";

export const runtime = "nodejs";

type DeleteBody = {
  corpus?: Corpus;
  collectionName?: string;
  workspaceId?: string;
  documentId?: string;
};

/**
 * CloudBase → Vercel → Astra deleteByDocument relay.
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

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const coll = assertNoCustomCollectionName(body.collectionName);
  if (!coll.ok) return Response.json({ error: coll.error }, { status: coll.status });

  const workspaceId = body.workspaceId?.trim();
  const documentId = body.documentId?.trim();
  if (!workspaceId || !documentId) {
    return Response.json({ error: "workspaceId_and_documentId_required" }, { status: 400 });
  }
  if (!isUuid(workspaceId) || !isUuid(documentId)) {
    return Response.json({ error: "invalid_ids" }, { status: 400 });
  }

  await createAstraVectorStore({
    corpus: body.corpus ?? "user",
  }).deleteByDocument(workspaceId, documentId);

  return Response.json({ ok: true });
}
