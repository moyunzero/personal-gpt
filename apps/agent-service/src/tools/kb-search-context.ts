/**
 * kb_search 按 thread_id 注入用户原话 / workspace。
 * 嵌套 Agent 的 tool 常拿不到完整 configurable.userText，但 thread_id 一般会传到。
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type KbSearchContext = {
  userText?: string;
  workspaceId?: string;
  allowedDocumentIds?: string[];
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

const KB_SOURCE_DEFAULT_TURN = "default";
const sourceOrdinalByTurn = new Map<string, number>();
const citationTurn = new AsyncLocalStorage<string>();

/** 一轮回答开始时把 [S n] 复位为 1。之后的 kb_search 与预检索共用这一序号。 */
export function beginKbCitationTurn(turnId: string): void {
  const key = turnId.trim();
  if (!key) return;
  sourceOrdinalByTurn.set(key, 1);
  citationTurn.enterWith(key);
}

export function clearKbSourceOrdinal(turnId: string): void {
  if (!turnId?.trim()) return;
  sourceOrdinalByTurn.delete(turnId.trim());
}

/** 测试用：下一次无 turn 的检索从 [S1] 起。 */
export function resetKbSourceOrdinal(): void {
  sourceOrdinalByTurn.set(KB_SOURCE_DEFAULT_TURN, 1);
}

/** 按当前轮次分配从 1 起的连续编号，返回本批第一条的编号。 */
export function allocateKbSourceOrdinals(count: number, turnId?: string): number {
  const key = turnId?.trim() || citationTurn.getStore() || KB_SOURCE_DEFAULT_TURN;
  const start = sourceOrdinalByTurn.get(key) ?? 1;
  sourceOrdinalByTurn.set(key, start + count);
  return start;
}

/** 测试用 */
export function clearAllKbSearchContextsForTests(): void {
  byThread.clear();
}

export function kbSearchContextSizeForTests(): number {
  return byThread.size;
}
