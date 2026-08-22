/**
 * 面向用户的 Agent 正文消毒：去掉 KB 工具协议标记，避免技术码外泄。
 */

/** 非 fence 段：折叠行内连续空白，保留行首缩进（嵌套列表 / 缩进代码） */
function normalizeNonFenceWhitespace(part: string): string {
  return part
    .split("\n")
    .map((line) => {
      const m = line.match(/^([ \t]*)(.*)$/);
      if (!m) return line;
      const indent = m[1] ?? "";
      const rest = (m[2] ?? "").replace(/[ \t]{2,}/g, " ");
      return indent + rest;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * 按 fence 分段：成对 ```…``` 原样保留；未闭合的 opening fence 及其后内容也不做空白折叠。
 */
function splitFenceAware(text: string): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("```", i);
    if (open === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (open > i) {
      parts.push(text.slice(i, open));
    }
    const afterOpen = open + 3;
    const close = text.indexOf("```", afterOpen);
    if (close === -1) {
      // 未闭合 fence：整段（含 opening）视为受保护
      parts.push(text.slice(open));
      break;
    }
    parts.push(text.slice(open, close + 3));
    i = close + 3;
  }
  return parts;
}

function isFencePart(part: string): boolean {
  return part.startsWith("```");
}

const TOOL_CALL_NAMES = "graph_search|kb_search|web_search";

/** 是否整段仅为 LLM 误输出的工具调用 JSON（应整段丢弃；嵌入正文中的片段由 stripToolCallLeakText 处理） */
export function isToolCallLeakText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (
    new RegExp(
      `^\`\`\`(?:json)?\\s*\\{[\\s\\S]*?"name"\\s*:\\s*"(${TOOL_CALL_NAMES})"[\\s\\S]*\\}\\s*\`\`\`$`,
      "i",
    ).test(t)
  ) {
    return true;
  }
  if (
    new RegExp(
      `^\\{[\\s\\S]*?"name"\\s*:\\s*"(${TOOL_CALL_NAMES})"[\\s\\S]*?"arguments"\\s*:[\\s\\S]*\\}$`,
      "i",
    ).test(t)
  ) {
    return true;
  }
  return false;
}

/** 去掉误输出的工具调用 JSON 块 */
export function stripToolCallLeakText(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(
    new RegExp(
      `\`\`\`(?:json)?\\s*\\{[\\s\\S]*?"name"\\s*:\\s*"(${TOOL_CALL_NAMES})"[\\s\\S]*?\\}\\s*\`\`\``,
      "gi",
    ),
    "",
  );
  out = out.replace(
    new RegExp(
      `\\{[\\s\\S]*?"name"\\s*:\\s*"(${TOOL_CALL_NAMES})"[\\s\\S]*?"arguments"\\s*:\\s*\\{[\\s\\S]*?\\}\\s*\\}`,
      "gi",
    ),
    "",
  );
  return out.trim();
}

/** 去掉 LLM 误复述的 Cypher / 内部 node id 关系行 */
export function stripGraphTechLeakLines(text: string): string {
  if (!text) return text;
  const kept = text.split("\n").filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (/^cypher\s*:/i.test(t)) return false;
    if (/\[:[\w]+\]->\([^)]+\)/.test(t)) return false;
    if (/^-\s*\[:[\w]+\]/.test(t)) return false;
    if (/^-\s*[a-z]+:[\w-]+\s*→\s*[A-Z_]+\s*→\s*[a-z]+:[\w-]+$/i.test(t)) return false;
    if (/^-\s*[a-z]+:[\w-]+\s*-\[[^\]]+\]->\s*[a-z]+:[\w-]+$/i.test(t)) return false;
    return true;
  });
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 将 KB_SEARCH_STATUS / NO_RELEVANT_HIT 等协议串替换为可读中文或删除 */
export function sanitizeUserFacingAgentText(text: string): string {
  if (!text) return text;

  let out = stripToolCallLeakText(text);
  out = stripGraphTechLeakLines(out);
  // 常见句式：「（KB_SEARCH_STATUS 为 NO_RELEVANT_HIT）」
  out = out.replace(
    /[（(]\s*KB_SEARCH_STATUS[^）)]*NO_RELEVANT_HIT[^）)]*[）)]/gi,
    "（知识库未找到足够依据）",
  );
  out = out.replace(/KB_SEARCH_STATUS\s*[:：=为]?\s*NO_RELEVANT_HIT/gi, "知识库未找到足够依据");
  out = out.replace(/KB_SEARCH_STATUS\s*[:：=为]?\s*HIT/gi, "");
  out = out.replace(/\bKB_SEARCH_STATUS\b/gi, "");
  out = out.replace(/\bNO_RELEVANT_HIT\b/gi, "未找到足够依据");
  out = out.replace(/GRAPH_SEARCH_STATUS\s*[:：=为]?\s*NO_PATH/gi, "图谱未找到相关路径");
  out = out.replace(/GRAPH_SEARCH_STATUS\s*[:：=为]?\s*HIT/gi, "");
  out = out.replace(/\bGRAPH_SEARCH_STATUS\b/gi, "");
  out = out.replace(/\bNO_PATH\b/gi, "未找到相关路径");
  // 清理空括号；空白折叠避开 fenced code（含未闭合 fence），避免破坏 Markdown 结构
  out = out.replace(/[（(]\s*[）)]/g, "");
  out = splitFenceAware(out)
    .map((part) => (isFencePart(part) ? part : normalizeNonFenceWhitespace(part)))
    .join("");
  // 状态句/正文后紧跟 Markdown 标题时断开，避免「…依据# 标题」粘连
  out = out.replace(/([^\n#])[ \t]*(#{1,6}[ \t])/g, "$1\n\n$2");
  return out;
}

/** 是否仍含须剥离的技术标记（验收门禁用） */
export function containsKbTechMarkers(text: string): boolean {
  return /KB_SEARCH_STATUS|NO_RELEVANT_HIT/i.test(text);
}
