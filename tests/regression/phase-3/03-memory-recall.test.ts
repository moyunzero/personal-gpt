/**
 * Phase 3 regression #3 — Memory recall session A→B (MEM-02)。
 * 后续由 Mem0 / ShortTermRedisMemory 填绿（plan 03-02）。
 * 禁止 live LLM。
 */
import { describe, expect, it } from "vitest";

describe("Phase 3 regression #3: memory recall session A→B (MEM-02)", () => {
  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  // Filled when Mem0 + ShortTermRedisMemory land (plan 03-02)
  it.todo("recalls preference from session A in session B via Mem0");
});
