/**
 * Chat 侧记忆装载入口（包装 shared session-memory + web logger）。
 */

import {
  loadMemoryContextBlock as loadShared,
  persistTurnMemory as persistShared,
  type MemoryDeps,
  type MemoryScope,
} from "@personal-gpt/shared";

import { logger } from "@/lib/logger";

export type { MemoryDeps, MemoryScope };

const USER_KEY_RE = /^[A-Za-z0-9._-]+$/;

/** 有效 userKey 才启用记忆；无效/缺失返回 null（禁止落入共享 anonymous 桶） */
export function parseUserKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128 || !USER_KEY_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function isMemoryEnabledUserKey(userKey: string | null): userKey is string {
  return userKey !== null;
}

export async function loadMemoryContextBlock(
  scope: MemoryScope,
  query: string,
  deps?: MemoryDeps,
): Promise<string> {
  if (!isMemoryEnabledUserKey(scope.userKey)) return "";
  try {
    return await loadShared(scope, query, deps);
  } catch (err) {
    logger.child({ scope: "chat.memory" }).warn("load failed", { err });
    return "";
  }
}

export async function persistTurnMemory(
  scope: MemoryScope,
  userText: string,
  assistantText: string,
  deps?: MemoryDeps,
): Promise<void> {
  if (!isMemoryEnabledUserKey(scope.userKey)) return;
  try {
    await persistShared(scope, userText, assistantText, deps);
  } catch (err) {
    logger.child({ scope: "chat.memory" }).warn("persist failed", { err });
  }
}
