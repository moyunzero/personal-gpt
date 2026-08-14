/**
 * 多步清单 → 确定性 Sequential 边（无 Supervisor handoff）。
 */
import { describe, expect, it } from "vitest";

import { inferRequiredSpecialists } from "../agents/supervisor.prompt";
import { shouldUseSequentialPipeline } from "./build-graph";

describe("shouldUseSequentialPipeline", () => {
  it("enables sequential for KB→web→report acceptance prompt", () => {
    const required = inferRequiredSpecialists(
      "先查知识库里关于 LangGraph 和 AutoGen 的资料，再联网补充优缺点，最后整理成一份带对比表和引用的 Markdown 报告",
    );
    expect(required).toEqual(["retriever", "researcher", "editor"]);
    expect(shouldUseSequentialPipeline(required)).toBe(true);
  });

  it("keeps open supervisor for single-specialist / vague asks", () => {
    expect(shouldUseSequentialPipeline(inferRequiredSpecialists("帮我查一下知识库"))).toBe(false);
    expect(shouldUseSequentialPipeline([])).toBe(false);
  });
});
