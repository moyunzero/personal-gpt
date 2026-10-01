import { randomUUID } from "node:crypto";

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "@/lib/env";

let cachedClient: S3Client | undefined;
let bucketReady: Promise<void> | undefined;

export function isMinioConfigured(): boolean {
  return Boolean(
    env.MINIO_ENDPOINT?.trim() && env.MINIO_ACCESS_KEY?.trim() && env.MINIO_SECRET_KEY?.trim(),
  );
}

function getS3Client(): S3Client {
  if (!isMinioConfigured()) {
    throw new Error(
      "MinIO is not configured (MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY)",
    );
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      endpoint: env.MINIO_ENDPOINT,
      region: "us-east-1",
      credentials: {
        accessKeyId: env.MINIO_ACCESS_KEY!,
        secretAccessKey: env.MINIO_SECRET_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return cachedClient;
}

async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const client = getS3Client();
      const bucket = env.MINIO_BUCKET;
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    })();
  }
  await bucketReady;
}

/** Upload bytes to MinIO; returns s3://bucket/key URI stored in documents.file_path */
export async function uploadToMinio(
  body: Buffer,
  mimeType: string,
  extension: string,
): Promise<string> {
  await ensureBucket();
  const key = `${randomUUID()}.${extension}`;
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: key,
      Body: body,
      ContentType: mimeType,
    }),
  );
  return `s3://${env.MINIO_BUCKET}/${key}`;
}

export function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  if (!uri.startsWith("s3://")) return null;
  const rest = uri.slice("s3://".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  const key = rest.slice(slash + 1);
  if (!bucket || !key) return null;
  return { bucket, key };
}

export async function deleteStoredObject(s3Uri: string): Promise<void> {
  const parsed = parseS3Uri(s3Uri);
  if (!parsed) throw new Error(`Invalid s3 uri: ${s3Uri}`);
  await ensureBucket();
  await getS3Client().send(new DeleteObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
}

export async function getStoredObjectStream(
  s3Uri: string,
): Promise<{ body: ReadableStream; contentType?: string } | null> {
  const parsed = parseS3Uri(s3Uri);
  if (!parsed) return null;
  await ensureBucket();
  const out = await getS3Client().send(
    new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }),
  );
  if (!out.Body) return null;
  const body = out.Body as { transformToWebStream?: () => ReadableStream };
  if (typeof body.transformToWebStream === "function") {
    return { body: body.transformToWebStream(), contentType: out.ContentType };
  }
  // Node.js Readable fallback
  const { Readable } = await import("node:stream");
  const nodeBody = out.Body as import("node:stream").Readable;
  return {
    body: Readable.toWeb(nodeBody) as ReadableStream,
    contentType: out.ContentType,
  };
}
