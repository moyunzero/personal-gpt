/**
 * kb_search 按 thread_id 注入用户原话 / workspace。
 * 嵌套 Agent 的 tool 常拿不到完整 configurable.userText，但 thread_id 一般会传到。
 */
export type KbSearchContext = {
  userText?: string;
  workspaceId?: string;
};

const byThread = new Map<string, KbSearchContext>();

export function setKbSearchContextForThread(
  threadId: string,
  ctx: KbSearchContext,
): void {
  if (!threadId?.trim()) return;
  byThread.set(threadId.trim(), ctx);
}

export function clearKbSearchContextForThread(threadId: string): void {
  if (!threadId?.trim()) return;
  byThread.delete(threadId.trim());
}

export function getKbSearchContextForThread(
  threadId?: string,
): KbSearchContext {
  if (!threadId?.trim()) return {};
  return byThread.get(threadId.trim()) ?? {};
}
