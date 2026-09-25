/**
 * 从 kb_search 命中 citation 生成面向用户的 Markdown（LLM 漏答/误报 miss 时兜底）。
 */

import type { Citation } from "@personal-gpt/shared";

const SNIPPET_MAX = 600;
const KB_MISS_RE = /知识库未找到足够(?:相关)?依据/;

/** 是否为 kb_search 工具原文（含 synthesizer prefetch 包装） */
export function isKbSearchToolOutput(content: string): boolean {
  if (/KB_SEARCH_STATUS:/i.test(content)) return true;
  const trimmed = content.trim();
  const hasMarker = trimmed.includes("[citation") || /\[S\d+\]/.test(trimmed);
  return hasMarker && trimmed.includes("documentId:") && trimmed.includes("snippet:");
}

/** 正文是否已有足够实质内容（排除纯 miss 模板） */
export function hasSubstantiveKbAnswer(text: string): boolean {
  const stripped = text
    .replace(KB_MISS_RE, "")
    .replace(/>\s*说明：知识库未找到足够依据[^\n]*/g, "")
    .replace(/KB_SEARCH_STATUS[^\n]*/gi, "")
    .trim();
  const cjkOnly = stripped.replace(/[^\u4e00-\u9fff]/g, "");
  if (cjkOnly.length >= 15) return true;
  const latinOnly = stripped.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  return latinOnly.length >= 40;
}

/** 从 citation 列表生成可读摘要；无 citation 返回空串 */
export function formatKbAnswerFromCitations(citations: Citation[], _userText: string): string {
  if (citations.length === 0) return "";

  const indexed = citations.map((citation, index) => ({
    citation,
    sourceNumber: index + 1,
  }));
  const sorted = [...indexed].sort((a, b) => b.citation.similarity - a.citation.similarity);
  const lines = ["根据知识库检索结果：", ""];

  const top = sorted[0]!.citation;
  const snippet = top.snippet.trim();
  if (snippet) {
    lines.push(snippet.length > SNIPPET_MAX ? `${snippet.slice(0, SNIPPET_MAX)}…` : snippet);
    lines.push("");
  }

  lines.push("**参考来源：**");
  for (const item of sorted.slice(0, 3)) {
    const src = item.citation.source?.trim() ? `（${item.citation.source.trim()}）` : "";
    lines.push(`- [S${item.sourceNumber}] ${item.citation.title}${src}`);
  }

  return lines.join("\n");
}
