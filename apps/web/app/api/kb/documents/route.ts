import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import {
  listDocuments,
  parseTagsParam,
  serializeDocumentRow,
  uploadDocument,
  UploadValidationError,
} from "@/lib/kb/documents.service";
import { documentsContextFromSession } from "@/lib/kb/request-context";
import { runKbGuards } from "@/lib/kb/route-guards";
import type { DocumentVisibility } from "@/lib/db/entities/document.entity";

/** GET /api/kb/documents — 分页列表 + 过滤 */
export async function GET(req: Request) {
  return runKbGuards(req, async () => {
    const authResult = await requireSession();
    if (authResult.error) return authResult.error;

    const ctx = documentsContextFromSession(authResult.session);

    try {
      const { searchParams } = new URL(req.url);
      const result = await listDocuments(ctx, {
        page: Number(searchParams.get("page") ?? 1),
        limit: Number(searchParams.get("limit") ?? 20),
        category: searchParams.get("category") ?? undefined,
        tags: parseTagsParam(searchParams.get("tags")),
        status: searchParams.get("status") ?? undefined,
        search: searchParams.get("search") ?? undefined,
      });
      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

/** POST /api/kb/documents — multipart 上传并入队 */
export async function POST(req: Request) {
  return runKbGuards(req, async () => {
    const authResult = await requireSession();
    if (authResult.error) return authResult.error;

    const ctx = documentsContextFromSession(authResult.session);

    try {
      const formData = await req.formData();
      const file = formData.get("file");

      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "缺少 file 字段" }, { status: 400 });
      }

      const tagsRaw = formData.get("tags");
      const tags =
        typeof tagsRaw === "string" && tagsRaw.trim()
          ? tagsRaw
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined;

      const category =
        typeof formData.get("category") === "string"
          ? (formData.get("category") as string)
          : undefined;
      const title =
        typeof formData.get("title") === "string" ? (formData.get("title") as string) : undefined;
      const visibilityRaw = formData.get("visibility");
      const visibility =
        typeof visibilityRaw === "string" &&
        (["workspace", "private", "restricted"] as DocumentVisibility[]).includes(
          visibilityRaw as DocumentVisibility,
        )
          ? (visibilityRaw as DocumentVisibility)
          : undefined;

      const { document, job } = await uploadDocument(file, ctx, {
        title,
        category,
        tags,
        visibility,
      });

      return NextResponse.json(
        {
          document: serializeDocumentRow(document, job),
          job: job
            ? {
                id: job.id,
                status: job.status,
                progress: job.progress,
                bullJobId: job.bullJobId,
              }
            : null,
        },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof UploadValidationError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
      }
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
