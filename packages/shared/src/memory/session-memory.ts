/**
 * Chat + Agent 共用记忆装载 / 持久化（MEM-01/02）。
 * 依赖可注入，便于回归 mock。
 */

import {
  extractStableFactsFromUserText,
  formatMem0ContextBlock,
  getMem0Client,
  type ScopedMem0Client,
} from "./mem0-client";
import { getShortTermRedisMemory, type ShortTermRedisMemory } from "./short-term-redis";

export type MemoryScope = {
  workspaceId: string;
  userKey: string;
};

export type MemoryDeps = {
  shortTerm?: ShortTermRedisMemory;
  mem0?: ScopedMem0Client;
};

function resolveUserKey(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 128 || !/^[A-Za-z0-9._-]+$/.test(t)) return null;
  return t;
}

export async function loadMemoryContextBlock(
  scope: MemoryScope,
  query: string,
  deps?: MemoryDeps,
): Promise<string> {
  const userKey = resolveUserKey(scope.userKey);
  if (!userKey) return "";
  const workspaceId = scope.workspaceId.trim() || "default";
  const MEMORY_LOAD_TIMEOUT_MS = 3_000;

  try {
    const shortTerm = deps?.shortTerm ?? (await getShortTermRedisMemory());
    const mem0 = deps?.mem0 ?? (await getMem0Client());

    const loadPromise = Promise.all([
      shortTerm.getContextBlock(workspaceId, userKey),
      mem0.searchMemories(workspaceId, userKey, query),
    ]).then(([shortBlock, hits]) => {
      const longBlock = formatMem0ContextBlock(hits);
      return [shortBlock, longBlock].filter(Boolean).join("\n\n");
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      loadPromise,
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(""), MEMORY_LOAD_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    return result;
  } catch (err) {
    console.warn("[memory] loadMemoryContextBlock failed (fail-open)", err);
    return "";
  }
}

export async function persistTurnMemory(
  scope: MemoryScope,
  userText: string,
  assistantText: string,
  deps?: MemoryDeps,
): Promise<void> {
  const userKey = resolveUserKey(scope.userKey);
  if (!userKey) return;
  const workspaceId = scope.workspaceId.trim() || "default";

  try {
    const shortTerm = deps?.shortTerm ?? (await getShortTermRedisMemory());
    const mem0 = deps?.mem0 ?? (await getMem0Client());

    await shortTerm.appendTurn(workspaceId, userKey, {
      role: "user",
      content: userText,
    });
    if (assistantText.trim()) {
      await shortTerm.appendTurn(workspaceId, userKey, {
        role: "assistant",
        content: assistantText,
      });
    }

    const facts = extractStableFactsFromUserText(userText);
    if (facts.length) {
      await mem0.addStableFacts(workspaceId, userKey, facts);
    }
  } catch (err) {
    console.warn("[memory] persistTurnMemory failed (fail-open)", err);
  }
}
