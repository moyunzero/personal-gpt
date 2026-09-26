import { In } from "typeorm";

import { DocumentEntity } from "@/lib/db/entities/document.entity";
import { getDataSource } from "@/lib/db/get-data-source";

const TITLE_EXT = /\.(pdf|md|txt|docx|markdown)$/i;

export function normalizeDocLabel(value: string): string {
  return value.trim().toLowerCase().replace(TITLE_EXT, "").replace(/\s+/g, "");
}

/** Every ready-document title that appears in the question. A shorter title nested inside a longer match is dropped. */
export function matchNamedDocuments(
  query: string,
  docs: ReadonlyArray<{ id: string; title: string }>,
): { id: string; title: string }[] {
  const normalizedQuery = normalizeDocLabel(query);
  if (normalizedQuery.length < 4) return [];

  const hits: { id: string; title: string; label: string }[] = [];
  for (const doc of docs) {
    const label = normalizeDocLabel(doc.title);
    if (label.length < 4 || !normalizedQuery.includes(label)) continue;
    hits.push({ id: doc.id, title: doc.title, label });
  }
  return hits
    .filter((hit) => !hits.some((other) => other.label.length > hit.label.length && other.label.includes(hit.label)))
    .map(({ id, title }) => ({ id, title }));
}

/** Longest ready-document title that appears in the question. */
export function matchNamedDocument(
  query: string,
  docs: ReadonlyArray<{ id: string; title: string }>,
): { id: string; title: string } | null {
  const matches = matchNamedDocuments(query, docs);
  if (matches.length === 0) return null;
  return matches.reduce((best, item) =>
    normalizeDocLabel(item.title).length > normalizeDocLabel(best.title).length ? item : best,
  );
}

/** 「第 12 页」→ 12. No page mentioned → null. */
export function pageAsked(query: string): number | null {
  const matched = query.match(/第\s*(\d{1,4})\s*页/);
  if (!matched) return null;
  const page = Number(matched[1]);
  return Number.isInteger(page) && page > 0 ? page : null;
}

/** If the question names a table row, return that tab-separated line. Otherwise keep the chunk. */
export function focusTableRow(query: string, text: string): string {
  if (!text.includes("\t")) return text;
  const tokens = query
    .split(/[\s，。？?、,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) return text;
  let best: { line: string; score: number } | null = null;
  for (const line of text.split("\n")) {
    if (!line.includes("\t")) continue;
    const score = tokens.filter((token) => line.includes(token)).length;
    if (score > 0 && (!best || score > best.score)) best = { line, score };
  }
  return best ? best.line : text;
}

export async function findNamedReadyDocument(
  workspaceId: string,
  allowedDocumentIds: readonly string[],
  query: string,
): Promise<{ id: string; title: string } | null> {
  if (!workspaceId.trim() || allowedDocumentIds.length === 0) return null;
  const ds = await getDataSource();
  const rows = await ds.getRepository(DocumentEntity).find({
    where: {
      workspaceId,
      status: "ready",
      id: In([...allowedDocumentIds]),
    },
    select: { id: true, title: true },
  });
  return matchNamedDocument(query, rows);
}

export async function findNamedReadyDocuments(
  workspaceId: string,
  allowedDocumentIds: readonly string[],
  query: string,
): Promise<{ id: string; title: string }[]> {
  if (!workspaceId.trim() || allowedDocumentIds.length === 0) return [];
  const ds = await getDataSource();
  const rows = await ds.getRepository(DocumentEntity).find({
    where: {
      workspaceId,
      status: "ready",
      id: In([...allowedDocumentIds]),
    },
    select: { id: true, title: true },
  });
  return matchNamedDocuments(query, rows);
}
