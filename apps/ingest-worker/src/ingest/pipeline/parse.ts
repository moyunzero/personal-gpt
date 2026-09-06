import * as fs from "node:fs/promises";
import * as path from "node:path";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

import { DEFAULT_ALLOWED_MIME_TYPES } from "../../../../../packages/shared/src/utils/ingest";
import {
  isS3Uri,
  materializeS3UriToTempFile,
} from "../../../../../packages/shared/src/storage/s3-uri";
import { getUploadsDir } from "../../../../../packages/shared/src/utils/paths";

const PARSE_TIMEOUT_MS = 60_000;

/** uploads/ 根目录（monorepo 根），解析前校验 filePath 必须在其下 */
const UPLOADS_ROOT = getUploadsDir();

function assertAllowedMime(mimeType: string): void {
  if (!DEFAULT_ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}

function resolveSafeFilePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const uploadsResolved = path.resolve(UPLOADS_ROOT);
  if (resolved !== uploadsResolved && !resolved.startsWith(`${uploadsResolved}${path.sep}`)) {
    throw new Error(`filePath outside uploads directory: ${filePath}`);
  }
  return resolved;
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${PARSE_TIMEOUT_MS}ms`)),
      PARSE_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function parsePdf(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value.trim();
}

async function parseText(filePath: string): Promise<string> {
  const text = await fs.readFile(filePath, "utf-8");
  return text.trim();
}

/**
 * 解析上传文件为纯文本（worker-only：pdf-parse@2 + mammoth + 直读，无 @langchain/community）。
 */
export async function parseDocument(filePath: string, mimeType: string): Promise<string> {
  assertAllowedMime(mimeType);

  let localPath = filePath;
  let tempPath: string | undefined;
  if (isS3Uri(filePath)) {
    tempPath = await materializeS3UriToTempFile(filePath);
    localPath = tempPath;
  } else {
    localPath = resolveSafeFilePath(filePath);
  }

  try {
    const stat = await fs.stat(localPath);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${localPath}`);
    }

    const parse = async (): Promise<string> => {
      switch (mimeType) {
        case "application/pdf":
          return parsePdf(localPath);
        case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
          return parseDocx(localPath);
        case "text/markdown":
        case "text/plain":
          return parseText(localPath);
        default:
          throw new Error(`No parser for MIME type: ${mimeType}`);
      }
    };

    const text = await withTimeout(parse(), `parseDocument(${mimeType})`);
    if (!text) {
      throw new Error(`Parsed empty text from ${localPath}`);
    }
    return text;
  } finally {
    if (tempPath) {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }
}

/** 测试/ fixture 用：跳过 uploads 路径校验 */
export async function parseDocumentUnsafe(filePath: string, mimeType: string): Promise<string> {
  assertAllowedMime(mimeType);

  const parse = async (): Promise<string> => {
    switch (mimeType) {
      case "application/pdf":
        return parsePdf(filePath);
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return parseDocx(filePath);
      case "text/markdown":
      case "text/plain":
        return parseText(filePath);
      default:
        throw new Error(`No parser for MIME type: ${mimeType}`);
    }
  };

  const text = await withTimeout(parse(), `parseDocument(${mimeType})`);
  if (!text) {
    throw new Error(`Parsed empty text from ${filePath}`);
  }
  return text;
}
