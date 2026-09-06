import {
  drainAstraRelayJobs,
  type AstraRelayJob,
} from "@personal-gpt/shared";
import { createAstraVectorStore } from "@personal-gpt/shared/stores/vector-store.astra";

/**
 * Best-effort drain of CloudBase→Redis Astra relay jobs.
 * Called from authenticated KB poll paths so Hobby (no minutely cron) still progresses.
 */
export async function drainAstraRelayBestEffort(maxJobs = 10): Promise<number> {
  if (!process.env.REDIS_URL?.trim()) return 0;

  try {
    return await drainAstraRelayJobs(async (job: AstraRelayJob) => {
      const store = createAstraVectorStore({
        corpus: job.corpus,
        collectionName: "collectionName" in job ? job.collectionName : undefined,
      });
      if (job.op === "upsert") {
        await store.upsert(job.chunks);
        return { ok: true };
      }
      if (job.op === "delete") {
        await store.deleteByDocument(job.workspaceId, job.documentId);
        return { ok: true };
      }
      const chunks = await store.search(job.params);
      return { ok: true, chunks };
    }, maxJobs);
  } catch {
    return 0;
  }
}
