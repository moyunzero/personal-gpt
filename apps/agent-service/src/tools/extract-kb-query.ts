/**
 * 从 Agent 长任务句压缩检索词：去掉「先查知识库 / 写报告」等套话，保留专有名词。
 * 对齐业界 query rewrite 的轻量规则版（无额外 LLM）。
 */

const TASK_BOILERPLATE = [
  /先查(一下)?知识库(里|中)?(关于|有关)?/gi,
  /再(联网)?补充[^，。,.！!？?]*/gi,
  /再整理成[^，。,.！!？?]*/gi,
  /整理成一份[^，。,.！!？?]*/gi,
  /写(一份|一篇)?[^，。,.！!？?]*报告/gi,
  /带对比表和引用的?/gi,
  /Markdown\s*报告/gi,
  /简短\s*Markdown/gi,
  /查(询|找|一下)?知识库(里|中)?的?/gi,
  /关于|有关/gi,
  /的资料|的内容|的文档/gi,
  /请|帮我|麻烦/gi,
];

const MIN_USEFUL = 2;

/**
 * 压缩检索 query；过短则回退原文。
 */
export function extractKbSearchQuery(text: string): string {
  const raw = text?.trim() ?? "";
  if (!raw) return raw;

  let out = raw;
  for (const re of TASK_BOILERPLATE) {
    out = out.replace(re, " ");
  }
  out = out
    .replace(/[，。,.！!？?；;：:\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (Array.from(out).length < MIN_USEFUL) {
    return raw;
  }
  return out;
}
