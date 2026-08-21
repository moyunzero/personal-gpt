/**
 * Agent LangSmith fail-open 单测（禁止 live LangSmith）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const traceableMock = vi.fn();

describe("ensureAgentLangSmithEnv", () => {
  const initial = {
    LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY,
    LANGSMITH_TRACING: process.env.LANGSMITH_TRACING,
    LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT,
  };

  beforeEach(() => {
    delete process.env.LANGSMITH_API_KEY;
    delete process.env.LANGSMITH_TRACING;
    delete process.env.LANGSMITH_PROJECT;
  });

  afterEach(async () => {
    for (const [k, v] of Object.entries(initial)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.doUnmock("langsmith/traceable");
    vi.resetModules();
  });

  it("returns false without key (fail-open)", async () => {
    const { ensureAgentLangSmithEnv, resetAgentLangSmithConfigForTests } =
      await import("./langsmith");
    resetAgentLangSmithConfigForTests();
    expect(ensureAgentLangSmithEnv()).toBe(false);
  });

  it("sets default project and wraps with traceable when enabled", async () => {
    process.env.LANGSMITH_API_KEY = "ls-test";
    process.env.LANGSMITH_TRACING = "true";
    delete process.env.LANGSMITH_PROJECT;

    traceableMock.mockImplementation((fn) => fn);
    vi.doMock("langsmith/traceable", () => ({
      traceable: traceableMock,
    }));

    const { ensureAgentLangSmithEnv, resetAgentLangSmithConfigForTests, traceAgentRun } =
      await import("./langsmith");
    resetAgentLangSmithConfigForTests();
    expect(ensureAgentLangSmithEnv()).toBe(true);
    expect(process.env.LANGSMITH_PROJECT).toBe("personal-gpt-agent");

    const out = await traceAgentRun("agent.chat", { threadId: "t1" }, async () => 42);
    expect(out).toBe(42);
    expect(traceableMock).toHaveBeenCalled();
  });
});
