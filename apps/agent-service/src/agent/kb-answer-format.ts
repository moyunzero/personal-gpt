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
  return (
    trimmed.includes("[citation") && trimmed.includes("documentId:") && trimmed.includes("snippet:")
  );
}

/** 正文是否已有足够实质内容（排除纯 miss 模板） */
export function hasSubstantiveKbAnswer(text: string): boolean {
  const stripped = text
    .replace(KB_MISS_RE, "")
    .replace(/>\s*说明：知识库未找到足够依据[^\n]*/g, "")
    .replace(/KB_SEARCH_STATUS[^\n]*/gi, "")
    .trim();
  const cjkOnly = stripped.replace(/[^\u4e00-\u9fff]/g, "");
  return cjkOnly.length >= 15;
}

/** 从 citation 列表生成可读摘要；无 citation 返回空串 */
export function formatKbAnswerFromCitations(citations: Citation[], _userText: string): string {
  if (citations.length === 0) return "";

  const sorted = [...citations].sort((a, b) => b.similarity - a.similarity);
  const lines = ["根据知识库检索结果：", ""];

  const top = sorted[0]!;
  const snippet = top.snippet.trim();
  if (snippet) {
    lines.push(snippet.length > SNIPPET_MAX ? `${snippet.slice(0, SNIPPET_MAX)}…` : snippet);
    lines.push("");
  }

  lines.push("**参考来源：**");
  for (const c of sorted.slice(0, 3)) {
    const src = c.source?.trim() ? `（${c.source.trim()}）` : "";
    lines.push(`- ${c.title}${src}`);
  }

  return lines.join("\n");
}
