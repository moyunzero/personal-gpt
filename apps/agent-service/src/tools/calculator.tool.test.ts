/**
 * calculator 单测：安全算术；拒绝代码注入。
 */
import { describe, expect, it } from "vitest";

describe("calculator tool", () => {
  it("evaluates safe arithmetic expressions", async () => {
    const { calculatorTool, invokeCalculator } = await import("./calculator.tool");
    expect(calculatorTool.name).toBe("calculator");
    expect(await invokeCalculator({ expression: "1 + 2 * 3" })).toBe("计算结果: 7");
    expect(await invokeCalculator({ expression: "(10 - 4) / 2" })).toBe("计算结果: 3");
  });

  it("rejects oversized or deeply nested expressions", async () => {
    const { invokeCalculator } = await import("./calculator.tool");
    const long = `1${"+1".repeat(120)}`;
    expect(await invokeCalculator({ expression: long })).toMatch(/拒绝|过长|非法/i);
    const deep = `${"(".repeat(40)}1${")".repeat(40)}`;
    expect(await invokeCalculator({ expression: deep })).toMatch(/拒绝|嵌套|非法/i);
  });

  it("rejects code-injection style expressions without throwing the graph", async () => {
    const { invokeCalculator } = await import("./calculator.tool");
    const bad = await invokeCalculator({
      expression: "require('fs').readFileSync('/etc/passwd')",
    });
    expect(bad).toMatch(/拒绝|非法|不安全|不支持/i);

    const proc = await invokeCalculator({
      expression: "process.exit(1)",
    });
    expect(proc).toMatch(/拒绝|非法|不安全|不支持/i);
  });

  it("rejects non-finite arithmetic results", async () => {
    const { evaluateSafeArithmetic, invokeCalculator } = await import("./calculator.tool");
    // 除零在解析阶段拒绝；有限性校验兜底其它溢出路径
    expect(() => evaluateSafeArithmetic("1/0")).toThrow(/除零|非有限|非法/);
    expect(await invokeCalculator({ expression: "1/0" })).toMatch(/拒绝|非法|不安全/);
  });
});
