import { describe, expect, it, vi } from "vitest";

vi.mock("langchain", () => ({
  createAgent: (opts: { systemPrompt?: string }) => opts,
}));

describe("createEditorAgent prompt", () => {
  it("forbids common-knowledge invention when evidence is missing", async () => {
    const { createEditorAgent } = await import("./editor.agent");
    const agent = createEditorAgent({} as never) as { systemPrompt?: string };
    const prompt = agent.systemPrompt ?? "";
    expect(prompt).not.toMatch(/公开常识/);
    expect(prompt).toMatch(/禁止.*推断|禁止.*编造事实/);
    expect(prompt).toMatch(/用户提供的材料|上游工具已返回/);
    expect(prompt).toMatch(/真实 URL/);
    expect(prompt).toMatch(/禁止编造具体版本号/);
  });
});
