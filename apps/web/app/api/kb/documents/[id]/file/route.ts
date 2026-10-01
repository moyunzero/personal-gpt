import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { get } from "@vercel/blob";
import { getUploadsDir } from "@personal-gpt/shared/utils/paths";

import { requireSession } from "@/lib/auth/session";
import { getDocumentById } from "@/lib/kb/documents.service";
import { documentsContextFromSession } from "@/lib/kb/request-context";
import { runKbGuards } from "@/lib/kb/route-guards";
import { getStoredObjectStream, isMinioConfigured, parseS3Uri } from "@/lib/storage/minio";
import { isTrustedVercelBlobUrl, isVercelBlobConfigured } from "@/lib/storage/vercel-blob";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/kb/documents/:id/file — 原文件。PDF 用浏览器的 #page=N 定位。 */
export async function GET(req: Request, context: RouteContext) {
  return runKbGuards(req, async () => {
    const authResult = await requireSession();
    if (authResult.error) return authResult.error;

    const ctx = await documentsContextFromSession(authResult.session);
    const { id } = await context.params;
    const row = await getDocumentById(id, ctx);
    const filePath = row?.document.filePath;
    const mimeType = row?.document.mimeType || "application/octet-stream";
    if (!filePath) {
      return new Response("文件不存在", { status: 404 });
    }

    if (isTrustedVercelBlobUrl(filePath) && isVercelBlobConfigured()) {
      const blob = await get(filePath, {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      if (!blob || blob.statusCode !== 200 || !blob.stream) {
        return new Response("文件不存在", { status: 404 });
      }
      return new Response(blob.stream, {
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": "inline",
        },
      });
    }

    if (parseS3Uri(filePath) && isMinioConfigured()) {
      const obj = await getStoredObjectStream(filePath);
      if (!obj) {
        return new Response("文件不存在", { status: 404 });
      }
      return new Response(obj.body, {
        headers: {
          "Content-Type": obj.contentType || mimeType,
          "Content-Disposition": "inline",
        },
      });
    }

    const uploads = path.resolve(getUploadsDir());
    const resolved = path.resolve(filePath);
    if (resolved !== uploads && !resolved.startsWith(`${uploads}${path.sep}`)) {
      return new Response("文件不存在", { status: 404 });
    }
    try {
      await access(resolved);
    } catch {
      return new Response("文件不存在", { status: 404 });
    }
    const nodeStream = createReadStream(resolved);
    return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": "inline",
      },
    });
  });
}
