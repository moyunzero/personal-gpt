/**
 * 按 Chat/Agent 模式分键持久化 thread_id（D-23 / CP-01）。
 * 刷新后同模式续聊；新会话旋转 id。
 */

import type { ChatMode } from "@/app/components/ModeSegmentedControl";

export const THREAD_STORAGE_KEYS = {
  chat: "pgpt.thread.chat",
  agent: "pgpt.thread.agent",
} as const;

/** 生成 opaque thread_id（与 agent-service SAFE_THREAD_ID 对齐） */
export function createThreadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function storageKey(mode: ChatMode): string {
  return THREAD_STORAGE_KEYS[mode];
}

/**
 * 读取或创建当前模式的 thread_id。仅客户端调用。
 */
export function getOrCreateThreadId(mode: ChatMode): string {
  if (typeof window === "undefined") {
    return createThreadId();
  }
  try {
    const key = storageKey(mode);
    const existing = window.localStorage.getItem(key)?.trim();
    if (existing) return existing;
    const next = createThreadId();
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return createThreadId();
  }
}

/**
 * 旋转当前模式 thread_id（新会话）。返回新 id。
 */
export function rotateThreadId(mode: ChatMode): string {
  const next = createThreadId();
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(storageKey(mode), next);
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}
