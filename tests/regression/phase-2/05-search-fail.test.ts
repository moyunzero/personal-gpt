/**
 * Phase 2 regression #5 — 搜索失败可见降级（D-14 / D-16）。
 * 期望：web_search / Bocha 失败时 UI 可见 error + 尽可能返回部分结果。
 * 后续 02-02 填绿；禁止 live LLM。
 *
 * Mock 目标（填绿时）：
 * - apps/agent-service/src/tools/web_search*
 * - BOCHA_API_KEY 缺失或 fetch reject
 */
import { describe, expect, it } from "vitest";

describe("Phase 2 regression #5: search failure graceful degradation (D-14/D-16)", () => {
  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  it.todo("surfaces visible error when web_search / Bocha fails");
  it.todo("still returns partial results from other agents when search degrades");
});
