import path from "node:path";
import { inflateRawSync } from "node:zlib";

import { PDF_NO_SELECTABLE_TEXT, parsePdfPages, readIngestBytes } from "./parse";
import { splitMineruMarkdown, splitPdfPages } from "./split";

export const PDF_PARSE_FAILED = "这份 PDF 没有解析出正文。请确认文件未加密、未损坏。";

const APPLY_URL = "https://mineru.net/api/v4/file-urls/batch";
const POLL_LIMIT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 60_000;

function withRequestTimeout(init: RequestInit = {}): RequestInit {
  return { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
}

type FetchLike = typeof fetch;

type LocalPdf = {
  pages: { num: number; text: string }[];
  headings: string[];
};

type PdfTrace = <T>(step: "parse" | "split", fn: () => Promise<T>) => Promise<T>;

export async function parseWithMinerU(
  bytes: Buffer,
  fileName: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  try {
    return await requestMineruMarkdown(bytes, fileName, fetchImpl);
  } catch (error) {
    if (error instanceof Error && error.message === PDF_PARSE_FAILED) throw error;
    throw new Error(PDF_PARSE_FAILED);
  }
}

async function requestMineruMarkdown(
  bytes: Buffer,
  fileName: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const token = process.env.MINERU_API_TOKEN?.trim();
  if (!token) {
    throw new Error(PDF_PARSE_FAILED);
  }
  const name = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  const body = JSON.stringify({
    files: [{ name, is_ocr: true }],
    model_version: "pipeline",
    enable_table: true,
  });
  const applied = await fetchImpl(
    APPLY_URL,
    withRequestTimeout({
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    }),
  );
  const appliedJson = (await applied.json()) as {
    code?: number;
    data?: { batch_id?: string; file_urls?: string[] };
  };
  const uploadUrl = appliedJson.data?.file_urls?.[0];
  const batchId = appliedJson.data?.batch_id;
  if (!applied.ok || appliedJson.code !== 0 || !uploadUrl || !batchId) {
    throw new Error(PDF_PARSE_FAILED);
  }
  const uploaded = await fetchImpl(
    uploadUrl,
    withRequestTimeout({ method: "PUT", body: new Uint8Array(bytes) }),
  );
  if (!uploaded.ok) {
    throw new Error(PDF_PARSE_FAILED);
  }
  const markdown = await pollMarkdown(batchId, token, fetchImpl);
  if (!markdown.replace(/\s+/g, "")) {
    throw new Error(PDF_PARSE_FAILED);
  }
  return markdown;
}

export async function resolvePdfChunks(
  filePath: string,
  options?: {
    fetchImpl?: FetchLike;
    parseLocal?: (filePath: string) => Promise<LocalPdf>;
    readBytes?: (filePath: string) => Promise<Buffer>;
    trace?: PdfTrace;
  },
): Promise<{ chunks: string[]; pages?: number[] }> {
  const trace: PdfTrace = options?.trace ?? ((_, fn) => fn());
  const parseLocal = options?.parseLocal ?? parsePdfPages;
  const readBytes = options?.readBytes ?? readIngestBytes;
  const fetchImpl = options?.fetchImpl ?? fetch;
  try {
    const parsed = await trace("parse", () => parseLocal(filePath));
    const pieces = await trace("split", () => splitPdfPages(parsed.pages, parsed.headings));
    return {
      chunks: pieces.map((piece) => piece.text),
      pages: pieces.map((piece) => piece.page),
    };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== PDF_NO_SELECTABLE_TEXT) {
      throw error;
    }
  }
  const bytes = await readBytes(filePath);
  const markdown = await trace("parse", () =>
    parseWithMinerU(bytes, mineruPdfName(filePath), fetchImpl),
  );
  const chunks = await trace("split", () => splitMineruMarkdown(markdown));
  return { chunks };
}

function mineruPdfName(filePath: string): string {
  let pathname = filePath;
  if (/^https?:\/\//i.test(filePath)) {
    try {
      pathname = new URL(filePath).pathname;
    } catch {
      pathname = "document.pdf";
    }
  }
  const base = path.basename(pathname) || "document.pdf";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

async function pollMarkdown(batchId: string, token: string, fetchImpl: FetchLike): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < POLL_LIMIT_MS) {
    const response = await fetchImpl(
      `https://mineru.net/api/v4/extract-results/batch/${batchId}`,
      withRequestTimeout({ headers: { Authorization: `Bearer ${token}` } }),
    );
    const json = (await response.json()) as {
      code?: number;
      data?: { extract_result?: MineruResult | MineruResult[] };
    };
    if (!response.ok || json.code !== 0) {
      throw new Error(PDF_PARSE_FAILED);
    }
    const result = firstResult(json.data?.extract_result);
    if (result?.state === "failed") {
      throw new Error(PDF_PARSE_FAILED);
    }
    if (result?.state === "done") {
      if (!result.full_zip_url) throw new Error(PDF_PARSE_FAILED);
      const zip = await fetchImpl(result.full_zip_url, withRequestTimeout());
      if (!zip.ok) throw new Error(PDF_PARSE_FAILED);
      const markdown = readZipEntry(Buffer.from(await zip.arrayBuffer()), "full.md");
      if (markdown == null) throw new Error(PDF_PARSE_FAILED);
      return markdown;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(PDF_PARSE_FAILED);
}

type MineruResult = { state?: string; full_zip_url?: string };

function firstResult(value: MineruResult | MineruResult[] | undefined): MineruResult | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function readZipEntry(buf: Buffer, suffix: string): string | null {
  let offset = 0;
  while (offset + 30 < buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buf.slice(dataStart, dataStart + compSize);
    if (name.endsWith(suffix)) {
      if (method === 0) return data.toString("utf8");
      if (method === 8) return inflateRawSync(data).toString("utf8");
    }
    offset = dataStart + compSize;
  }
  return null;
}
