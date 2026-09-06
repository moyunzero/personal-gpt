import { requireSession } from "@/lib/auth/session";
import { getIngestJobForContext } from "@/lib/kb/ingest-jobs.service";
import { documentsContextFromSession } from "@/lib/kb/request-context";
import { runKbGuards } from "@/lib/kb/route-guards";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/kb/jobs/:id — 轮询导入进度（SSE 的 JSON 替代）。
 */
export async function GET(req: Request, context: RouteContext) {
  return runKbGuards(req, async () => {
    const authResult = await requireSession();
    if (authResult.error) return authResult.error;

    const ctx = await documentsContextFromSession(authResult.session);
    const { id: jobId } = await context.params;

    const job = await getIngestJobForContext(jobId, ctx);
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
  });
}
