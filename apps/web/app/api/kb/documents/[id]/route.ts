import { NextResponse } from "next/server";

import { updateDocumentVisibility } from "@/lib/auth/workspace.service";
import type { DocumentVisibility } from "@/lib/db/entities/document.entity";
import {
  deleteDocument,
  getDocumentById,
  serializeDocumentRow,
  updateDocumentMetadata,
} from "@/lib/kb/documents.service";
import { documentsContextFromSession } from "@/lib/kb/request-context";
import { guardKbRequest } from "@/lib/kb/route-guards";
import { requireSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

async function kbContext(req: Request) {
  const denied = await guardKbRequest(req);
  if (denied) return { error: denied };

  const authResult = await requireSession();
  if (authResult.error) return { error: authResult.error };

  return { ctx: documentsContextFromSession(authResult.session) };
}

/** GET /api/kb/documents/:id — 详情 + 最近 ingest 状态 */
export async function GET(req: Request, context: RouteContext) {
  const gate = await kbContext(req);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const { id } = await context.params;
    const row = await getDocumentById(id, gate.ctx!);
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

/** PATCH /api/kb/documents/:id — 编辑 metadata / visibility (D-46) */
export async function PATCH(req: Request, context: RouteContext) {
  const gate = await kbContext(req);
  if ("error" in gate && gate.error) return gate.error;

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
        gate.ctx!.workspaceId,
        gate.ctx!.userId,
        {
          visibility: body.visibility,
          restrictedUserIds: body.restrictedUserIds,
        },
      );
      if (!updatedVisibility) {
        return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 });
      }
    }

    const updated = await updateDocumentMetadata(id, gate.ctx!, {
      title: body.title,
      category: body.category,
      tags: body.tags,
    });
    if (!updated) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    const row = await getDocumentById(id, gate.ctx!);
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
  const gate = await kbContext(req);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const { id } = await context.params;
    const deleted = await deleteDocument(id, gate.ctx!);
    if (!deleted) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
