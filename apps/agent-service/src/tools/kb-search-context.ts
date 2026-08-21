/**
 * kb_search 按 thread_id 注入用户原话 / workspace。
 * 嵌套 Agent 的 tool 常拿不到完整 configurable.userText，但 thread_id 一般会传到。
 */
export type KbSearchContext = {
  userText?: string;
  workspaceId?: string;
};

/** 防漏清时无界增长；Map 保持插入序，超限淘汰最旧条目 */
export const MAX_KB_SEARCH_THREAD_CONTEXTS = 256;

const byThread = new Map<string, KbSearchContext>();

export function setKbSearchContextForThread(threadId: string, ctx: KbSearchContext): void {
  if (!threadId?.trim()) return;
  const key = threadId.trim();
  if (byThread.has(key)) {
    byThread.delete(key);
  } else if (byThread.size >= MAX_KB_SEARCH_THREAD_CONTEXTS) {
    const oldest = byThread.keys().next().value;
    if (oldest !== undefined) byThread.delete(oldest);
  }
  byThread.set(key, ctx);
}

export function clearKbSearchContextForThread(threadId: string): void {
  if (!threadId?.trim()) return;
  byThread.delete(threadId.trim());
}

export function getKbSearchContextForThread(threadId?: string): KbSearchContext {
  if (!threadId?.trim()) return {};
  return byThread.get(threadId.trim()) ?? {};
}

/** 测试用 */
export function clearAllKbSearchContextsForTests(): void {
  byThread.clear();
}

export function kbSearchContextSizeForTests(): number {
  return byThread.size;
}
