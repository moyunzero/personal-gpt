import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

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

function isHttpUrl(filePath: string): boolean {
  return /^https?:\/\//i.test(filePath);
}

function resolveSafeFilePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const uploadsResolved = path.resolve(UPLOADS_ROOT);
  if (resolved !== uploadsResolved && !resolved.startsWith(`${uploadsResolved}${path.sep}`)) {
    throw new Error(`filePath outside uploads directory: ${filePath}`);
  }
  return resolved;
}

/** Stream-read a body with a hard byte cap (remote ingest DoS guard). */
export async function readBodyWithByteLimit(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(`Remote file exceeds upload limit: ${total} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function resolveUploadMaxBytes(): number {
  const raw = process.env.UPLOAD_MAX_BYTES;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 20_971_520;
}

async function materializeHttpUrlToTempFile(uri: string): Promise<string> {
  let bytes: Uint8Array;
  const maxBytes = resolveUploadMaxBytes();
  const isVercelBlob = /blob\.vercel-storage\.com/i.test(uri);
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();

  if (isVercelBlob && token) {
    const { get } = await import("@vercel/blob");
    const result = await get(uri, { access: "private", token });
    if (!result?.stream) {
      throw new Error(`Empty Vercel Blob: ${uri}`);
    }
    bytes = await readBodyWithByteLimit(result.stream as ReadableStream<Uint8Array>, maxBytes);
  } else {
    const res = await fetch(uri);
    if (!res.ok) {
      throw new Error(`Failed to download ${uri}: HTTP ${res.status}`);
    }
    if (!res.body) {
      throw new Error(`Empty body: ${uri}`);
    }
    bytes = await readBodyWithByteLimit(res.body, maxBytes);
  }

  const ext = path.extname(new URL(uri).pathname) || ".bin";
  const tempPath = path.join(os.tmpdir(), `pgpt-ingest-${randomUUID()}${ext}`);
  await fs.writeFile(tempPath, Buffer.from(bytes));
  return tempPath;
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

const PAGE_MARKER_LINE = /^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/;

export const PDF_NO_SELECTABLE_TEXT = "这份 PDF 没有可选中的正文。";

export function pdfBodyText(pages: ReadonlyArray<{ text: string }>): string {
  return pages
    .map((page) => stripPageMarkerLines(page.text))
    .join("")
    .replace(/\s+/g, "");
}

export function assertPdfHasBody(pages: ReadonlyArray<{ text: string }>): void {
  if (pdfBodyText(pages).length === 0) {
    throw new Error(PDF_NO_SELECTABLE_TEXT);
  }
}

function stripPageMarkerLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !PAGE_MARKER_LINE.test(line))
    .join("\n");
}

type OutlineNode = { title?: string; items?: OutlineNode[] };

function collectOutlineTitles(nodes: OutlineNode[] | undefined, titles: string[]): void {
  if (!nodes) return;
  for (const node of nodes) {
    const title = node.title?.trim();
    if (title) titles.push(title);
    collectOutlineTitles(node.items, titles);
  }
}

async function readPdfBuffer(buffer: Buffer): Promise<{
  pages: { num: number; text: string }[];
  headings: string[];
}> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    const info = await parser.getInfo();
    const headings: string[] = [];
    collectOutlineTitles(info.outline as OutlineNode[] | undefined, headings);
    const rawPages = (result.pages ?? []) as Array<{ num?: number; text?: string }>;
    return {
      headings,
      pages: rawPages.map((page, index) => ({
        num: page.num ?? index + 1,
        text: (page.text ?? "").trim(),
      })),
    };
  } finally {
    await parser.destroy();
  }
}

export async function parsePdfPages(filePath: string): Promise<{
  pages: { num: number; text: string }[];
  headings: string[];
}> {
  const opened = await openLocalCopy(filePath);
  try {
    const stat = await fs.stat(opened.localPath);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${opened.localPath}`);
    }
    const buffer = await fs.readFile(opened.localPath);
    const parsed = await withTimeout(readPdfBuffer(buffer), "parsePdfPages");
    assertPdfHasBody(parsed.pages);
    return parsed;
  } finally {
    await opened.cleanup?.();
  }
}

export async function readIngestBytes(filePath: string): Promise<Buffer> {
  const opened = await openLocalCopy(filePath);
  try {
    return await fs.readFile(opened.localPath);
  } finally {
    await opened.cleanup?.();
  }
}

async function openLocalCopy(
  filePath: string,
): Promise<{ localPath: string; cleanup?: () => Promise<void> }> {
  if (isS3Uri(filePath)) {
    const tempPath = await materializeS3UriToTempFile(filePath);
    return {
      localPath: tempPath,
      cleanup: () => fs.unlink(tempPath).catch(() => undefined),
    };
  }
  if (isHttpUrl(filePath)) {
    const tempPath = await materializeHttpUrlToTempFile(filePath);
    return {
      localPath: tempPath,
      cleanup: () => fs.unlink(tempPath).catch(() => undefined),
    };
  }
  return { localPath: resolveSafeFilePath(filePath) };
}

async function parsePdf(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const parsed = await readPdfBuffer(buffer);
  assertPdfHasBody(parsed.pages);
  return parsed.pages
    .map((page) => stripPageMarkerLines(page.text).trim())
    .filter((text) => text.length > 0)
    .join("\n")
    .trim();
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
  } else if (isHttpUrl(filePath)) {
    tempPath = await materializeHttpUrlToTempFile(filePath);
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
