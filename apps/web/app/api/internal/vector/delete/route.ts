import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import type { Corpus } from "@personal-gpt/shared";

import { isTrustedInternalProxy } from "@/lib/internal-proxy-auth";

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

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const workspaceId = body.workspaceId?.trim();
  const documentId = body.documentId?.trim();
  if (!workspaceId || !documentId) {
    return Response.json({ error: "workspaceId_and_documentId_required" }, { status: 400 });
  }

  await createAstraVectorStore({
    corpus: body.corpus ?? "user",
    collectionName: body.collectionName,
  }).deleteByDocument(workspaceId, documentId);

  return Response.json({ ok: true });
}
