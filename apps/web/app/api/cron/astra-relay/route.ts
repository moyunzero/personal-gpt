import { timingSafeEqual } from "node:crypto";

import { drainAstraRelayJobs, type AstraRelayJob } from "@personal-gpt/shared";
import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";

import { isTrustedInternalProxy } from "@/lib/internal-proxy-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handleJob(job: AstraRelayJob) {
  const store = createAstraVectorStore({
    corpus: job.corpus,
    collectionName: "collectionName" in job ? job.collectionName : undefined,
  });
  if (job.op === "upsert") {
    await store.upsert(job.chunks);
    return { ok: true as const };
  }
  if (job.op === "delete") {
    await store.deleteByDocument(job.workspaceId, job.documentId);
    return { ok: true as const };
  }
  const chunks = await store.search(job.params);
  return { ok: true as const, chunks };
}

function isCronAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const provided = auth.slice("Bearer ".length).trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(cronSecret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Drain Redis Astra relay queue (CloudBase → Redis → Vercel → Astra).
 * Auth: Vercel Cron `Authorization: Bearer CRON_SECRET` or x-internal-proxy-key.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req) && !isTrustedInternalProxy(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.REDIS_URL?.trim()) {
    return Response.json({ error: "REDIS_URL_missing" }, { status: 500 });
  }

  const processed = await drainAstraRelayJobs(handleJob, 30);
  return Response.json({ ok: true, processed });
}

export async function POST(req: Request) {
  return GET(req);
}
