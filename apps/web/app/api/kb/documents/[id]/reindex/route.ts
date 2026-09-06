import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import {
  ReindexBusyError,
  reindexDocument,
  serializeDocumentRow,
} from "@/lib/kb/documents.service";
import { documentsContextFromSession } from "@/lib/kb/request-context";
import { runKbGuards } from "@/lib/kb/route-guards";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/kb/documents/:id/reindex — 无确认，直接 processing + 入队 */
export async function POST(req: Request, context: RouteContext) {
  return runKbGuards(req, async () => {
    const authResult = await requireSession();
    if (authResult.error) return authResult.error;

    const ctx = await documentsContextFromSession(authResult.session);

    try {
      const { id } = await context.params;
      const result = await reindexDocument(id, ctx);
      if (!result) {
        return NextResponse.json({ error: "文档不存在或缺少源文件" }, { status: 404 });
      }

      const { job } = result;
      return NextResponse.json({
        document: serializeDocumentRow(result.document, job),
        job: {
          id: job.id,
          status: job.status,
          progress: job.progress,
          bullJobId: job.bullJobId,
        },
      });
    } catch (error) {
      if (error instanceof ReindexBusyError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
