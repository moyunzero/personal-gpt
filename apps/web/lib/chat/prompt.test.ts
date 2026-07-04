import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "./prompt";

describe("buildSystemPrompt", () => {
  it("ok 分支：注入 <context> + 允许忽略无关资料", () => {
    const prompt = buildSystemPrompt({
      kind: "ok",
      blocks: '<context source="prompt-suggestion" trusted="false">示例内容</context>',
      docCount: 1,
      sources: ["prompt-suggestion"],
      citations: [],
    });

    expect(prompt).toContain("示例内容");
    expect(prompt).toContain("不相关则完全忽略");
    expect(prompt).toContain("通用知识");
  });

  it("no-docs 分支：要求直接回答，不拒绝", () => {
    const prompt = buildSystemPrompt({ kind: "no-docs" });

    expect(prompt).toContain("直接回答");
    expect(prompt).not.toContain("<context");
  });

  it("每个分支保留混合模式定位", () => {
    for (const prompt of [
      buildSystemPrompt({ kind: "no-docs" }),
      buildSystemPrompt({ kind: "timeout" }),
      buildSystemPrompt({
        kind: "ok",
        blocks: "x",
        docCount: 1,
        sources: ["x"],
        citations: [],
      }),
    ]) {
      expect(prompt).toContain("通用能力");
      expect(prompt).toContain("知识库");
    }
  });
});
