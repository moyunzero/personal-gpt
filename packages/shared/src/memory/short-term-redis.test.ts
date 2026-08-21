/**
 * ShortTermRedisMemory — key isolation + N-cap (MEM-01 / D-17 / D-18).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ShortTermRedisMemory,
  type MemoryTurn,
  type RedisLike,
} from "./short-term-redis.js";

/** Minimal in-memory Redis fake (no ioredis-mock dependency). */
class FakeRedis implements RedisLike {
  store = new Map<string, string>();
  failNext = false;

  async get(key: string): Promise<string | null> {
    if (this.failNext) throw new Error("redis down");
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<"OK"> {
    if (this.failNext) throw new Error("redis down");
    this.store.set(key, value);
    return "OK";
  }
}

describe("ShortTermRedisMemory", () => {
  const logs: unknown[] = [];
  const log = (...args: unknown[]) => {
    logs.push(args);
  };

  afterEach(() => {
    logs.length = 0;
    vi.restoreAllMocks();
  });

  it("scopes keys by MEMORY_KEY_PREFIX:workspaceId:userKey — no cross-user bleed", async () => {
    const redis = new FakeRedis();
    const mem = new ShortTermRedisMemory({
      redis,
      keyPrefix: "pgpt:stm",
      n: 5,
      log,
    });

    await mem.appendTurn("ws-a", "user-1", { role: "user", content: "我喜欢简洁回答" });
    await mem.appendTurn("ws-a", "user-1", { role: "assistant", content: "好的" });
    await mem.appendTurn("ws-a", "user-2", { role: "user", content: "我喜欢详细回答" });

    const a = await mem.getContextBlock("ws-a", "user-1");
    const b = await mem.getContextBlock("ws-a", "user-2");
    const c = await mem.getContextBlock("ws-b", "user-1");

    expect(a).toContain("我喜欢简洁回答");
    expect(a).not.toContain("我喜欢详细回答");
    expect(b).toContain("我喜欢详细回答");
    expect(b).not.toContain("我喜欢简洁回答");
    expect(c).toBe("");

    expect([...redis.store.keys()]).toEqual(
      expect.arrayContaining(["pgpt:stm:ws-a:user-1", "pgpt:stm:ws-a:user-2"]),
    );
    expect(redis.store.has("pgpt:stm:ws-b:user-1")).toBe(false);
  });

  it("caps stored turns to SHORT_MEMORY_N and keeps rolling summary", async () => {
    const redis = new FakeRedis();
    const mem = new ShortTermRedisMemory({
      redis,
      keyPrefix: "pgpt:stm",
      n: 2,
      log,
    });

    const turns: MemoryTurn[] = [
      { role: "user", content: "t1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "t2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "t3" },
      { role: "assistant", content: "a3" },
    ];
    for (const t of turns) {
      await mem.appendTurn("ws", "u", t);
    }
    await mem.maybeUpdateSummary("ws", "u", "滚动摘要：偏好简洁");

    const block = await mem.getContextBlock("ws", "u");
    expect(block).toContain("滚动摘要：偏好简洁");
    expect(block).toContain("t3");
    expect(block).toContain("a3");
    expect(block).not.toContain("t1");
    expect(block).not.toContain("a1");
  });

  it("fail-opens to empty context when Redis missing or errors (no throw)", async () => {
    const noRedis = new ShortTermRedisMemory({ redis: null, log });
    await expect(noRedis.appendTurn("ws", "u", { role: "user", content: "x" })).resolves.toBeUndefined();
    await expect(noRedis.getContextBlock("ws", "u")).resolves.toBe("");

    const redis = new FakeRedis();
    redis.failNext = true;
    const mem = new ShortTermRedisMemory({ redis, keyPrefix: "pgpt:stm", n: 3, log });
    await expect(mem.appendTurn("ws", "u", { role: "user", content: "x" })).resolves.toBeUndefined();
    await expect(mem.getContextBlock("ws", "u")).resolves.toBe("");
    expect(logs.length).toBeGreaterThan(0);
  });
});
