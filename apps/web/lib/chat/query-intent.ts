/**
 * 用户消息意图的轻量判定（可维护词表，避免巨型正则）。
 */

const GREETING_PHRASES = new Set([
  "你好",
  "您好",
  "嗨",
  "hi",
  "hello",
  "hey",
  "在吗",
  "在不在",
  "早上好",
  "晚上好",
  "午安",
  "拜拜",
  "再见",
  "谢谢",
  "好的",
  "ok",
  "okay",
]);

const TRAILING_PUNCTUATION = /^[\s!！?？。,，~]+|[\s!！?？。,，~]+$/g;

function normalizeForIntent(text: string): string {
  return text.trim().replace(TRAILING_PUNCTUATION, "").toLowerCase();
}

export function isEmptyQuery(text: string): boolean {
  return !text.trim();
}

export function isPureMathExpression(text: string): boolean {
  const trimmed = text.trim();
  return /\d/.test(trimmed) && /^[\d\s+\-*/()=？?]+$/.test(trimmed);
}

/** 整句仅为寒暄（词表匹配，非正则枚举） */
export function isGreetingOnly(text: string): boolean {
  const core = normalizeForIntent(text);
  if (!core) {
    return false;
  }
  return GREETING_PHRASES.has(core);
}
