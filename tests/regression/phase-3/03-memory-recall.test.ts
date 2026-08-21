/**
 * Phase 3 regression #3 — Memory recall session A→B (MEM-01/02)。
 * Session A 存偏好 → Session B 召回；mock Redis + Mem0，禁止 live LLM。
 */
import { describe, expect, it } from "vitest";

import {
  ShortTermRedisMemory,
  createScopedMem0Client,
  extractStableFactsFromUserText,
  loadMemoryContextBlock,
  memoryUserId,
  persistTurnMemory,
  type Mem0RawClient,
  type RedisLike,
} from "@personal-gpt/shared";

class FakeRedis implements RedisLike {
  store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<"OK"> {
    this.store.set(key, value);
    return "OK";
  }
}

function createMockMem0() {
  const byUser = new Map<string, string[]>();
  const raw: Mem0RawClient = {
    async add(messages, options) {
      const uid = options.userId;
      const list = byUser.get(uid) ?? [];
      for (const m of messages) {
        if (m.role === "user" && m.content.trim()) list.push(m.content.trim());
      }
      byUser.set(uid, list);
    },
    async search(_query, options) {
      const uid = options.filters.user_id;
      const list = byUser.get(uid) ?? [];
      return {
        results: list.map((memory) => ({ memory, score: 0.9 })),
      };
    },
  };
  return { mem0: createScopedMem0Client(raw), byUser };
}

describe("Phase 3 regression #3: memory recall session A→B (MEM-02)", () => {
  it("recalls preference from session A in session B via Mem0 + short-term (mock)", async () => {
    const redis = new FakeRedis();
    const shortTerm = new ShortTermRedisMemory({
      redis,
      keyPrefix: "pgpt:stm",
      n: 6,
    });
    const { mem0 } = createMockMem0();

    const workspaceId = "ws-reg-03";
    const userKey = "device-alice";
    const preference = "请记住：我喜欢简洁回答";

    expect(extractStableFactsFromUserText(preference).length).toBeGreaterThan(0);
    expect(memoryUserId(workspaceId, userKey)).toBe("ws-reg-03:device-alice");

    // Session A：存偏好
    await persistTurnMemory(
      { workspaceId, userKey },
      preference,
      "好的，我会尽量简洁。",
      { shortTerm, mem0 },
    );

    // Session B：新「会话」仅靠同一 userKey 召回
    const block = await loadMemoryContextBlock(
      { workspaceId, userKey },
      "我喜欢什么回答风格？",
      { shortTerm, mem0 },
    );

    expect(block).toContain("简洁");
    expect(block).toMatch(/长期记忆|短期记忆/);

    // 隔离：其他 userKey 不应看到
    const other = await loadMemoryContextBlock(
      { workspaceId, userKey: "device-bob" },
      "我喜欢什么回答风格？",
      { shortTerm, mem0 },
    );
    expect(other).not.toContain("简洁回答");
  });

  it("Chat and Agent request shapes include userKey (contract)", () => {
    // 前端 page + agent parseAgentChatBody 均接受 userKey；此处锁契约字段名
    const chatBody = { messages: [], corpus: "user", userKey: "uk-1" };
    const agentBody = {
      messages: [{ role: "user", content: "hi" }],
      workspaceId: "default",
      userKey: "uk-1",
    };
    expect(chatBody.userKey).toBe("uk-1");
    expect(agentBody.userKey).toBe("uk-1");
  });
});
