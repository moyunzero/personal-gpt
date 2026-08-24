import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { updateDocumentVisibility } from "@/lib/auth/workspace.service";
import type { DocumentVisibility } from "@/lib/db/entities/document.entity";
import {
  deleteDocument,
  getDocumentById,
  serializeDocumentRow,
  updateDocumentMetadata,
} from "@/lib/kb/documents.service";
import { documentsContextFromSession } from "@/lib/kb/request-context";
import { runKbGuards } from "@/lib/kb/route-guards";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/kb/documents/:id — 详情 + 最近 ingest 状态 */
export async function GET(req: Request, context: RouteContext) {
  return runKbGuards(req, async () => {
    const authResult = await requireSession();
    if (authResult.error) return authResult.error;

    const ctx = await documentsContextFromSession(authResult.session);

    try {
      const { id } = await context.params;
      const row = await getDocumentById(id, ctx);
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
  });
}

/** PATCH /api/kb/documents/:id — 编辑 metadata / visibility (D-46) */
export async function PATCH(req: Request, context: RouteContext) {
  return runKbGuards(req, async () => {
    const authResult = await requireSession();
    if (authResult.error) return authResult.error;

    const ctx = await documentsContextFromSession(authResult.session);

    try {
      const { id } = await context.params;
      const body = (await req.json()) as {
        title?: string;
        category?: string | null;
        tags?: string[];
        visibility?: DocumentVisibility;
        restrictedUserIds?: string[];
      };

      if (body.visibility) {
        const updatedVisibility = await updateDocumentVisibility(
          id,
          ctx.workspaceId,
          ctx.userId,
          {
            visibility: body.visibility,
            restrictedUserIds: body.restrictedUserIds,
          },
        );
        if (!updatedVisibility) {
          return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 });
        }
      }

      const updated = await updateDocumentMetadata(id, ctx, {
        title: body.title,
        category: body.category,
        tags: body.tags,
      });
      if (!updated) {
        return NextResponse.json({ error: "文档不存在" }, { status: 404 });
      }

      const row = await getDocumentById(id, ctx);
      return NextResponse.json({
        document: serializeDocumentRow(row!.document, row!.job),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

/** DELETE /api/kb/documents/:id — 先清向量再删元数据 */
export async function DELETE(req: Request, context: RouteContext) {
  return runKbGuards(req, async () => {
    const authResult = await requireSession();
    if (authResult.error) return authResult.error;

    const ctx = await documentsContextFromSession(authResult.session);

    try {
      const { id } = await context.params;
      const deleted = await deleteDocument(id, ctx);
      if (!deleted) {
        return NextResponse.json({ error: "文档不存在" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
