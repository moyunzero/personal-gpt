import { randomUUID } from "node:crypto";

import { put } from "@vercel/blob";

/** Vercel Blob（生产上传）；本地无 token 时走本地 uploads/ 或 MinIO */
export function isVercelBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** 仅接受 Vercel Blob 域名，防止客户端任意 URL 入库 */
export function isTrustedVercelBlobUrl(fileUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(fileUrl);
    if (protocol !== "https:") return false;
    return hostname === "blob.vercel-storage.com" || hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/**
 * 上传到 Vercel Blob（private），返回可被 ingest 用 token 拉取的 URL。
 */
export async function uploadToVercelBlob(
  body: Buffer,
  mimeType: string,
  extension: string,
): Promise<string> {
  if (!isVercelBlobConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }
  const pathname = `uploads/${randomUUID()}.${extension}`;
  const blob = await put(pathname, body, {
    access: "private",
    contentType: mimeType,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}
