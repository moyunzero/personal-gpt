import { NextResponse } from "next/server";

import {
  deleteDocument,
  getDocumentById,
  serializeDocumentRow,
  updateDocumentMetadata,
} from "@/lib/kb/documents.service";
import { guardKbRequest } from "@/lib/kb/route-guards";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/kb/documents/:id — 详情 + 最近 ingest 状态 */
export async function GET(req: Request, context: RouteContext) {
  const denied = await guardKbRequest(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const row = await getDocumentById(id);
    if (!row) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }
    return NextResponse.json({
      document: serializeDocumentRow(row.document, row.job),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/kb/documents/:id — 编辑 title/category/tags */
export async function PATCH(req: Request, context: RouteContext) {
  const denied = await guardKbRequest(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = (await req.json()) as {
      title?: string;
      category?: string | null;
      tags?: string[];
    };

    const updated = await updateDocumentMetadata(id, body);
    if (!updated) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    const row = await getDocumentById(id);
    return NextResponse.json({
      document: serializeDocumentRow(row!.document, row!.job),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/kb/documents/:id — 先清向量再删元数据 */
export async function DELETE(req: Request, context: RouteContext) {
  const denied = await guardKbRequest(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const deleted = await deleteDocument(id);
    if (!deleted) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
