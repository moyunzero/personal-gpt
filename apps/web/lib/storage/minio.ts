import { randomUUID } from "node:crypto";

import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "@/lib/env";

let cachedClient: S3Client | undefined;
let bucketReady: Promise<void> | undefined;

export function isMinioConfigured(): boolean {
  return Boolean(env.MINIO_ENDPOINT?.trim() && env.MINIO_ACCESS_KEY?.trim() && env.MINIO_SECRET_KEY?.trim());
}

function getS3Client(): S3Client {
  if (!isMinioConfigured()) {
    throw new Error("MinIO is not configured (MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY)");
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
