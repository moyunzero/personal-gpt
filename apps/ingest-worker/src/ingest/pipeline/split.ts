import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { INGEST_CHUNK_DEFAULTS } from "../../../../../packages/shared/src/utils/ingest";
import type { ChunkRecord } from "../../../../../packages/shared/src/stores/vector-store";

export async function splitText(text: string): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: INGEST_CHUNK_DEFAULTS.chunkSize,
    chunkOverlap: INGEST_CHUNK_DEFAULTS.chunkOverlap,
  });
  return splitter.splitText(text);
}

export interface ChunkRecordMeta {
  workspaceId: string;
  documentId: string;
  title?: string;
  source?: string;
  category?: string;
  tags?: string[];
}

/**
 * 将切块与 embedding 向量映射为 VectorStore upsert 记录（DATA-02：每条含 workspaceId）。
 */
export function toChunkRecords(
  chunks: string[],
  vectors: number[][],
  meta: ChunkRecordMeta,
  pages?: ReadonlyArray<number | undefined>,
): ChunkRecord[] {
  if (chunks.length !== vectors.length) {
    throw new Error(`chunks/vectors length mismatch: ${chunks.length} vs ${vectors.length}`);
  }
  if (!meta.workspaceId?.trim()) {
    throw new Error("toChunkRecords requires workspaceId");
  }
  if (!meta.documentId?.trim()) {
    throw new Error("toChunkRecords requires documentId");
  }

  return chunks.map((text, chunkIndex) => {
    const page = pages?.[chunkIndex];
    const record = {
      workspaceId: meta.workspaceId,
      documentId: meta.documentId,
      chunkIndex,
      text,
      vector: vectors[chunkIndex]!,
      title: meta.title,
      source: meta.source,
      category: meta.category,
      tags: meta.tags,
    };
    if (typeof page === "number" && Number.isFinite(page)) {
      return { ...record, metadata: { page } };
    }
    return record;
  });
}

const CHAPTER_LINE = /^第[0-9０-９一二三四五六七八九十百零千]+[章节篇部]/;
const NUMBERED_HEADING = /^\d+(?:\.\d+)*\s+\S/;

export async function splitPdfPages(
  pages: ReadonlyArray<{ num: number; text: string }>,
  headings: readonly string[] = [],
): Promise<Array<{ text: string; page: number }>> {
  const chunks: Array<{ text: string; page: number }> = [];
  for (const page of pages) {
    chunks.push(...(await splitOnePdfPage(page.num, page.text, headings)));
  }
  return chunks;
}

async function splitOnePdfPage(
  page: number,
  raw: string,
  headings: readonly string[],
): Promise<Array<{ text: string; page: number }>> {
  const text = stripMarkers(raw).trim();
  if (!text) return [];
  const lines = text.split("\n");
  const outlineHit = lines.some((line) => headings.includes(line.trim()));
  const blocks = splitHeadingBlocks(lines, headings, !outlineHit);
  const pieces: string[] = [];
  for (const block of blocks) {
    pieces.push(...(await splitBlock(block)));
  }
  return pieces.filter((piece) => piece.trim().length > 0).map((piece) => ({ text: piece, page }));
}

function stripMarkers(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/.test(line))
    .join("\n");
}

function splitHeadingBlocks(
  lines: string[],
  headings: readonly string[],
  heuristic: boolean,
): string[] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (current.length > 0 && isPdfHeading(line, headings, heuristic)) {
      blocks.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks.map((block) => block.join("\n"));
}

function isPdfHeading(line: string, headings: readonly string[], heuristic: boolean): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (headings.includes(trimmed)) return true;
  if (!heuristic || trimmed.length > 80) return false;
  return CHAPTER_LINE.test(trimmed) || NUMBERED_HEADING.test(trimmed);
}

async function splitBlock(block: string): Promise<string[]> {
  const lines = block.split("\n");
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index]?.includes("\t")) {
      let end = index;
      while (end < lines.length && lines[end]?.includes("\t")) end += 1;
      out.push(...splitTable(lines.slice(index, end)));
      index = end;
    } else {
      let end = index;
      while (end < lines.length && !lines[end]?.includes("\t")) end += 1;
      out.push(...(await splitProse(lines.slice(index, end).join("\n"))));
      index = end;
    }
  }
  return out;
}

function splitTable(lines: string[]): string[] {
  const size = INGEST_CHUNK_DEFAULTS.chunkSize;
  const whole = lines.join("\n");
  if (whole.length <= size) return [whole];
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const line of lines) {
    const row = line.length > size ? splitLongRow(line) : [line];
    for (const piece of row) {
      const next = length + piece.length + 1;
      if (current.length > 0 && next > size) {
        chunks.push(current.join("\n"));
        current = [piece];
        length = piece.length;
      } else {
        current.push(piece);
        length = next;
      }
    }
  }
  if (current.length > 0) chunks.push(current.join("\n"));
  return chunks;
}

function splitLongRow(line: string): string[] {
  const size = INGEST_CHUNK_DEFAULTS.chunkSize;
  const cells = line.split("\t");
  const pieces: string[] = [];
  let current = "";
  for (const cell of cells) {
    const addition = current ? `\t${cell}` : cell;
    if (current && current.length + addition.length > size) {
      pieces.push(current);
      current = cell;
    } else {
      current = current ? current + addition : cell;
    }
  }
  if (current) pieces.push(current);
  return pieces.flatMap((piece) =>
    piece.length <= size ? [piece] : (piece.match(new RegExp(`.{1,${size}}`, "g")) ?? [piece]),
  );
}

async function splitProse(text: string): Promise<string[]> {
  const size = INGEST_CHUNK_DEFAULTS.chunkSize;
  if (text.length <= size) return text.trim() ? [text] : [];
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: size,
    chunkOverlap: INGEST_CHUNK_DEFAULTS.chunkOverlap,
    separators: ["\n\n", "\n", "\t"],
  });
  const first = await splitter.splitText(text);
  const pieces: string[] = [];
  for (const part of first) {
    if (part.length <= size) {
      pieces.push(part);
      continue;
    }
    const finer = new RecursiveCharacterTextSplitter({
      chunkSize: size,
      chunkOverlap: INGEST_CHUNK_DEFAULTS.chunkOverlap,
    });
    pieces.push(...(await finer.splitText(part)));
  }
  return pieces;
}

export async function splitMineruMarkdown(markdown: string): Promise<string[]> {
  const headings = [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1]!.trim());
  const plain = markdown.replace(/^#{1,6}\s+/gm, "");
  const pieces = await splitPdfPages([{ num: 1, text: plain }], headings);
  return pieces.map((piece) => piece.text);
}
