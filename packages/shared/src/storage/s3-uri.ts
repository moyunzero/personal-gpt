import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { getEnv } from "../schemas/env";

const S3_URI_RE = /^s3:\/\/([^/]+)\/(.+)$/;

export function isS3Uri(filePath: string): boolean {
  return filePath.startsWith("s3://");
}

export function parseS3Uri(uri: string): { bucket: string; key: string } {
  const match = S3_URI_RE.exec(uri);
  if (!match) {
    throw new Error(`Invalid S3 URI: ${uri}`);
  }
  return { bucket: match[1], key: match[2] };
}

function getS3Client(): S3Client {
  const env = getEnv();
  const endpoint = env.MINIO_ENDPOINT?.trim();
  const accessKey = env.MINIO_ACCESS_KEY?.trim();
  const secretKey = env.MINIO_SECRET_KEY?.trim();
  if (!endpoint || !accessKey || !secretKey) {
    throw new Error("MinIO is not configured for S3 reads");
  }
  return new S3Client({
    endpoint,
    region: "us-east-1",
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: true,
  });
}

/** Download s3:// object to a temp file for parsers that need a local path */
export async function materializeS3UriToTempFile(uri: string): Promise<string> {
  const { bucket, key } = parseS3Uri(uri);
  const client = getS3Client();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = response.Body;
  if (!body) {
    throw new Error(`Empty S3 object: ${uri}`);
  }
  const bytes = await body.transformToByteArray();
  const ext = path.extname(key) || ".bin";
  const tempPath = path.join(os.tmpdir(), `pgpt-ingest-${randomUUID()}${ext}`);
  await fs.writeFile(tempPath, Buffer.from(bytes));
  return tempPath;
}
