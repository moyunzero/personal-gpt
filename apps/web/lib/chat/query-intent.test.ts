import { describe, expect, it } from "vitest";

import { isGreetingOnly, isPureMathExpression } from "./query-intent";

describe("query-intent", () => {
  it("识别寒暄", () => {
    expect(isGreetingOnly("你好")).toBe(true);
    expect(isGreetingOnly("hello!")).toBe(true);
    expect(isGreetingOnly("谢谢！")).toBe(true);
  });

  it("非纯寒暄", () => {
    expect(isGreetingOnly("你好，介绍一下项目")).toBe(false);
    expect(isGreetingOnly("美团怎么样")).toBe(false);
  });

  it("纯算式", () => {
    expect(isPureMathExpression("1 + 2 = ?")).toBe(true);
    expect(isPureMathExpression("介绍一下")).toBe(false);
    expect(isPureMathExpression("?")).toBe(false);
    expect(isPureMathExpression("()")).toBe(false);
  });
});
