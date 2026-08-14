/**
 * calculator 单测：安全算术；拒绝代码注入。
 */
import { describe, expect, it } from "vitest";

describe("calculator tool", () => {
  it("evaluates safe arithmetic expressions", async () => {
    const { calculatorTool, invokeCalculator } = await import("./calculator.tool");
    expect(calculatorTool.name).toBe("calculator");
    expect(await invokeCalculator({ expression: "1 + 2 * 3" })).toMatch(/7/);
    expect(await invokeCalculator({ expression: "(10 - 4) / 2" })).toMatch(/3/);
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
});
