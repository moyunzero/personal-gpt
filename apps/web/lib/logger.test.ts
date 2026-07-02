import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "./logger";

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // 都 mockImplementation 成空函数，避免测试输出污染终端
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("info / debug 走 console.log，带 [level] 前缀", () => {
    logger.info("hello", { foo: 1 });
    logger.debug("dbg");

    expect(logSpy).toHaveBeenCalledWith(`[info] hello {"foo":1}`);
    expect(logSpy).toHaveBeenCalledWith(`[debug] dbg`);
  });

  it("warn 走 console.warn", () => {
    logger.warn("careful", { x: "y" });
    expect(warnSpy).toHaveBeenCalledWith(`[warn] careful {"x":"y"}`);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("error 走 console.error", () => {
    logger.error("boom");
    expect(errorSpy).toHaveBeenCalledWith(`[error] boom`);
  });

  it("metric 输出 [METRIC] 前缀，走 console.log", () => {
    logger.metric("vector.search.ok", { docCount: 3 });
    expect(logSpy).toHaveBeenCalledWith(`[METRIC] vector.search.ok {"docCount":3}`);
  });

  it("Error 实例被展开成 {name, message, stack}", () => {
    const err = new Error("nope");
    logger.error("失败", { err });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0]![0] as string;
    expect(line).toContain(`[error] 失败`);
    expect(line).toContain(`"name":"Error"`);
    expect(line).toContain(`"message":"nope"`);
    expect(line).toContain(`"stack":`);
  });

  it("child() 把 baseFields 与调用 fields 合并，调用 fields 优先级更高", () => {
    const child = logger.child({ requestId: "req-1", scope: "chat" });
    child.info("started", { scope: "vector" });

    expect(logSpy).toHaveBeenCalledWith(
      `[info] started {"requestId":"req-1","scope":"vector"}`,
    );
  });

  it("child 可以再 child，深度合并 baseFields", () => {
    const a = logger.child({ a: 1 });
    const b = a.child({ b: 2 });
    b.info("x");

    expect(logSpy).toHaveBeenCalledWith(`[info] x {"a":1,"b":2}`);
  });

  it("无 fields 时不附加 JSON 段", () => {
    logger.info("plain");
    expect(logSpy).toHaveBeenCalledWith(`[info] plain`);
  });

  it("循环引用 fields 不抛错，输出兜底字符串", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    logger.info("loop", { a });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0]![0] as string;
    expect(line).toContain(`[info] loop`);
    expect(line).toContain(`[unserializable fields]`);
  });
});
