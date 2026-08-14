/**
 * Supervisor 提示：多步意图强制清单。
 */
import { describe, expect, it } from "vitest";

import {
  buildSupervisorPrompt,
  inferRequiredSpecialists,
} from "./supervisor.prompt";

describe("inferRequiredSpecialists", () => {
  it("returns empty for single-intent questions", () => {
    expect(inferRequiredSpecialists("今天天气怎么样")).toEqual([]);
    expect(inferRequiredSpecialists("帮我查一下知识库里的差旅政策")).toEqual(
      [],
    );
  });

  it("infers kb → web → editor for acceptance-style query", () => {
    const q =
      "先查知识库里关于 LangGraph 和 AutoGen 的资料，再联网补充优缺点，最后编辑成带表格的 Markdown 报告";
    expect(inferRequiredSpecialists(q)).toEqual([
      "retriever",
      "researcher",
      "editor",
    ]);
  });

  it("does not force analyst merely because report asks for 对比表", () => {
    const q =
      "先查知识库，再联网补充优缺点，最后整理成带对比表和引用的 Markdown 报告";
    expect(inferRequiredSpecialists(q)).toEqual([
      "retriever",
      "researcher",
      "editor",
    ]);
  });
});

describe("buildSupervisorPrompt", () => {
  it("injects forced checklist when multi-step intent present", () => {
    const prompt = buildSupervisorPrompt(
      "",
      "先知识库检索，再联网调研，最后写成 Markdown 报告",
    );
    expect(prompt).toMatch(/本轮强制调度清单/);
    expect(prompt).toMatch(/retriever/);
    expect(prompt).toMatch(/researcher/);
    expect(prompt).toMatch(/editor/);
  });
});
