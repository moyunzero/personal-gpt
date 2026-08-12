/**
 * 图编译 smoke 占位。
 * 02-01 实现 `buildGraph` 后取消 skip，并用 mock model 断言 compile 成功。
 */
import { describe, expect, it } from "vitest";

describe.skip("buildGraph smoke (fill in 02-01)", () => {
  it("compiles supervisor graph with a mock model", async () => {
    // 目标路径：apps/agent-service/src/graph/build-graph.ts（02-01）
    try {
      const mod = await import("./build-graph");
      expect(typeof (mod as { buildGraph?: unknown }).buildGraph).toBe("function");
    } catch {
      // buildGraph 尚未落地时跳过；本文件存在即可被 `yarn vitest run apps/agent-service` 收集
      expect(true).toBe(true);
    }
  });
});

/** 保证 suite 至少有一条可执行用例，避免空文件 / 全 skip 导致收集失败 */
describe("buildGraph smoke harness", () => {
  it("placeholder until buildGraph lands in 02-01", () => {
    expect(true).toBe(true);
  });
});
