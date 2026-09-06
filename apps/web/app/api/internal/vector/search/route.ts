import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";
import type { VectorSearchParams } from "@personal-gpt/shared/stores/vector-store";
import type { Corpus } from "@personal-gpt/shared";

import { isTrustedInternalProxy } from "@/lib/internal-proxy-auth";

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

  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.params?.workspaceId || !Array.isArray(body.params.vector)) {
    return Response.json({ error: "params_required" }, { status: 400 });
  }

  const chunks = await createAstraVectorStore({
    corpus: body.corpus ?? "user",
    collectionName: body.collectionName,
  }).search(body.params);

  return Response.json({ chunks });
}
