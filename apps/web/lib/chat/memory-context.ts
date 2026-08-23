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

export function parseUserKey(raw: unknown): string {
  if (typeof raw !== "string") return "anonymous";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128 || !/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    return "anonymous";
  }
  return trimmed;
}

export async function loadMemoryContextBlock(
  scope: MemoryScope,
  query: string,
  deps?: MemoryDeps,
): Promise<string> {
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
  try {
    await persistShared(scope, userText, assistantText, deps);
  } catch (err) {
    logger.child({ scope: "chat.memory" }).warn("persist failed", { err });
  }
}
