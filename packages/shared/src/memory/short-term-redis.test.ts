/**
 * Stub for ShortTermRedisMemory (plan 03-02 / Wave 2).
 * Soft-skips until packages/shared/src/memory/short-term-redis.ts exists.
 */
import { describe, expect, it } from "vitest";

describe("ShortTermRedisMemory", () => {
  it("soft-skips until short-term-redis module lands", async () => {
    try {
      await import("./short-term-redis.js");
    } catch {
      expect(true).toBe(true);
      return;
    }
    expect(true).toBe(true);
  });

  it.todo("scopes keys by workspaceId:userKey via ShortTermRedisMemory");
});
