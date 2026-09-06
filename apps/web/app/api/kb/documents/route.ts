import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import {
  listDocuments,
  parseTagsParam,
  serializeDocumentRow,
  uploadDocument,
  uploadDocumentFromRemote,
  UploadValidationError,
} from "@/lib/kb/documents.service";
import { documentsContextFromSession } from "@/lib/kb/request-context";
import { runKbGuards } from "@/lib/kb/route-guards";
import type { DocumentVisibility } from "@/lib/db/entities/document.entity";

function parseVisibility(raw: unknown): DocumentVisibility | undefined {
  if (
    typeof raw === "string" &&
    (["workspace", "private", "restricted"] as DocumentVisibility[]).includes(
      raw as DocumentVisibility,
    )
  ) {
    return raw as DocumentVisibility;
  }
  return undefined;
}

function parseTagsField(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    return raw
      .map(String)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return undefined;
}

/** GET /api/kb/documents — 分页列表 + 过滤 */
export async function GET(req: Request) {
  return runKbGuards(req, async () => {
    const authResult = await requireSession();
    if (authResult.error) return authResult.error;

    const ctx = await documentsContextFromSession(authResult.session);

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

/** POST /api/kb/documents — multipart 上传，或 JSON 登记已直传的 Blob URL */
export async function POST(req: Request) {
  return runKbGuards(req, async () => {
    const authResult = await requireSession();
    if (authResult.error) return authResult.error;

    const ctx = await documentsContextFromSession(authResult.session);

    try {
      const contentType = req.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        const body = (await req.json()) as {
          fileUrl?: string;
          fileName?: string;
          mimeType?: string;
          size?: number;
          title?: string;
          category?: string;
          tags?: string | string[];
          visibility?: string;
        };

        if (!body.fileUrl || !body.fileName || typeof body.size !== "number") {
          return NextResponse.json(
            { error: "缺少 fileUrl / fileName / size" },
            { status: 400 },
          );
        }

        const { document, job } = await uploadDocumentFromRemote(
          {
            fileUrl: body.fileUrl,
            fileName: body.fileName,
            mimeType: body.mimeType ?? "",
            size: body.size,
          },
          ctx,
          {
            title: body.title,
            category: body.category,
            tags: parseTagsField(body.tags),
            visibility: parseVisibility(body.visibility),
          },
        );

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
      }

      const formData = await req.formData();
      const file = formData.get("file");

      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "缺少 file 字段" }, { status: 400 });
      }

      const tags = parseTagsField(formData.get("tags"));
      const category =
        typeof formData.get("category") === "string"
          ? (formData.get("category") as string)
          : undefined;
      const title =
        typeof formData.get("title") === "string" ? (formData.get("title") as string) : undefined;
      const visibility = parseVisibility(formData.get("visibility"));

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
