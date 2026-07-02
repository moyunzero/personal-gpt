import { NextResponse } from "next/server";

import {
  reindexDocument,
  serializeDocumentRow,
} from "@/lib/kb/documents.service";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/kb/documents/:id/reindex — 无确认，直接 processing + 入队 */
export async function POST(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await reindexDocument(id);
    if (!result) {
      return NextResponse.json(
        { error: "文档不存在或缺少源文件" },
        { status: 404 },
      );
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
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
