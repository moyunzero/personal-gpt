/**
 * 面向用户的 Agent 正文消毒：去掉 KB 工具协议标记，避免技术码外泄。
 */

/** 将 KB_SEARCH_STATUS / NO_RELEVANT_HIT 等协议串替换为可读中文或删除 */
export function sanitizeUserFacingAgentText(text: string): string {
  if (!text) return text;

  let out = text;
  // 常见句式：「（KB_SEARCH_STATUS 为 NO_RELEVANT_HIT）」
  out = out.replace(
    /[（(]\s*KB_SEARCH_STATUS[^）)]*NO_RELEVANT_HIT[^）)]*[）)]/gi,
    "（知识库未找到足够依据）",
  );
  out = out.replace(
    /KB_SEARCH_STATUS\s*[:：=为]?\s*NO_RELEVANT_HIT/gi,
    "知识库未找到足够依据",
  );
  out = out.replace(/KB_SEARCH_STATUS\s*[:：=为]?\s*HIT/gi, "");
  out = out.replace(/\bKB_SEARCH_STATUS\b/gi, "");
  out = out.replace(/\bNO_RELEVANT_HIT\b/gi, "未找到足够依据");
  // 清理空括号 / 多余空白
  out = out.replace(/[（(]\s*[）)]/g, "");
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

/** 是否仍含须剥离的技术标记（验收门禁用） */
export function containsKbTechMarkers(text: string): boolean {
  return /KB_SEARCH_STATUS|NO_RELEVANT_HIT/i.test(text);
}
