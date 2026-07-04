import { getIngestJobById } from "@/lib/kb/ingest-jobs.service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/kb/jobs/:id — 轮询导入进度（SSE 的 JSON 替代）。
 */
export async function GET(_req: Request, context: RouteContext) {
  const { id: jobId } = await context.params;

  const job = await getIngestJobById(jobId);
  if (!job) {
    return Response.json({ error: "任务不存在" }, { status: 404 });
  }

  return Response.json({
    id: job.id,
    documentId: job.documentId,
    status: job.status,
    progress: job.progress,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}
