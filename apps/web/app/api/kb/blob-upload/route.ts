import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { runKbGuards } from "@/lib/kb/route-guards";
import { isVercelBlobConfigured } from "@/lib/storage/vercel-blob";

/**
 * POST /api/kb/blob-upload — 为浏览器直传 Vercel Blob 签发 client token。
 * 绕过 Serverless 4.5MB 请求体限制；实际文件不经过本函数。
 */
export async function POST(request: Request) {
  return runKbGuards(request, async () => {
    if (!isVercelBlobConfigured()) {
      return NextResponse.json({ error: "blob_unavailable" }, { status: 503 });
    }

    const body = (await request.json()) as HandleUploadBody;

    try {
      const jsonResponse = await handleUpload({
        body,
        request,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith("uploads/")) {
            throw new Error("pathname must start with uploads/");
          }
          return {
            allowedContentTypes: [...env.ALLOWED_MIME_TYPES],
            maximumSizeInBytes: env.UPLOAD_MAX_BYTES,
            addRandomSuffix: true,
          };
        },
      });
      return NextResponse.json(jsonResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
