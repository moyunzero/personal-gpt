/**
 * 无登录用户记忆键（D-18）：opaque userKey 存 localStorage。
 * Phase 4 登录后映射到真实 userId。
 */

const STORAGE_KEY = "pgpt:userKey";

/** 生成 opaque 随机键（浏览器 crypto；SSR 回退）。 */
export function createOpaqueUserKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `uk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 读取或创建 localStorage userKey。仅客户端调用。
 */
export function getOrCreateUserKey(): string {
  if (typeof window === "undefined") {
    return createOpaqueUserKey();
  }
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)?.trim();
    if (existing) return existing;
    const next = createOpaqueUserKey();
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return createOpaqueUserKey();
  }
}
