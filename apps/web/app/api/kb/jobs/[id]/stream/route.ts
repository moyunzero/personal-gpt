import { getIngestJobById } from "@/lib/kb/ingest-jobs.service";
import { getIngestQueueEvents } from "@/lib/kb/queue";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/kb/jobs/:id/stream — SSE 推送 BullMQ 导入进度（D-11）。
 * 校验 ingest_job 属于 default workspace，防 job id 枚举（T-01-13）。
 */
export async function GET(req: Request, context: RouteContext) {
  const { id: jobId } = await context.params;

  const ingestJob = await getIngestJobById(jobId);
  if (!ingestJob?.bullJobId) {
    return new Response(JSON.stringify({ error: "任务不存在" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const bullJobId = ingestJob.bullJobId;
  const queueEvents = getIngestQueueEvents();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const closeStream = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      // 连接建立时推送当前 PG 状态（避免错过已完成 job）
      send("progress", { progress: ingestJob.progress });
      if (ingestJob.status === "completed") {
        send("completed", { progress: 100 });
        closeStream();
        return;
      }
      if (ingestJob.status === "failed") {
        send("failed", { error: ingestJob.error ?? "导入失败" });
        closeStream();
        return;
      }

      const toProgressNumber = (value: unknown): number => {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string") {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      const onProgress = (args: { jobId: string; data: unknown }) => {
        if (String(args.jobId) !== bullJobId) return;
        send("progress", { progress: toProgressNumber(args.data) });
      };

      const onCompleted = ({ jobId: eventJobId }: { jobId: string }) => {
        if (String(eventJobId) !== bullJobId) return;
        send("completed", { progress: 100 });
        cleanup();
        closeStream();
      };

      const onFailed = ({
        jobId: eventJobId,
        failedReason,
      }: {
        jobId: string;
        failedReason?: string;
      }) => {
        if (String(eventJobId) !== bullJobId) return;
        send("failed", { error: failedReason ?? "导入失败" });
        cleanup();
        closeStream();
      };

      const cleanup = () => {
        queueEvents.off("progress", onProgress);
        queueEvents.off("completed", onCompleted);
        queueEvents.off("failed", onFailed);
      };

      queueEvents.on("progress", onProgress);
      queueEvents.on("completed", onCompleted);
      queueEvents.on("failed", onFailed);

      // Pitfall 4：客户端断开时移除监听
      req.signal.addEventListener("abort", () => {
        cleanup();
        closeStream();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
