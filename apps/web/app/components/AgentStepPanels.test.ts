/**
 * AGENT-05：AgentStepPanels 解析 data-agent-step / tool parts；空数据不渲染。
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  AgentStepPanels,
  extractAgentSteps,
} from "./AgentStepPanels";

function assistantMessage(parts: UIMessage["parts"]): UIMessage {
  return { id: "m1", role: "assistant", parts };
}

describe("AgentStepPanels (AGENT-05)", () => {
  it("extractAgentSteps parses data-agent-step parts", () => {
    const steps = extractAgentSteps(
      assistantMessage([
        {
          type: "data-agent-step",
          id: "step-1",
          data: {
            id: "step-1",
            agent: "Retriever",
            title: "kb_search",
            status: "active",
            summary: "检索中",
          },
        },
      ]),
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]?.agent).toBe("Retriever");
    expect(steps[0]?.status).toBe("active");
  });

  it("returns null / empty when no step data (do not render section)", () => {
    expect(extractAgentSteps(assistantMessage([{ type: "text", text: "hi" }]))).toEqual(
      [],
    );
    const html = renderToStaticMarkup(
      createElement(AgentStepPanels, {
        message: assistantMessage([{ type: "text", text: "hi" }]),
      }),
    );
    expect(html).toBe("");
  });

  it("renders fold controls with aria-expanded", () => {
    const html = renderToStaticMarkup(
      createElement(AgentStepPanels, {
        message: assistantMessage([
          {
            type: "data-agent-step",
            id: "step-2",
            data: {
              id: "step-2",
              agent: "Supervisor",
              title: "调度专科助手",
              status: "completed",
              summary: "已分派",
            },
          },
        ]),
      }),
    );
    expect(html).toContain("aria-expanded");
    expect(html).toContain("执行步骤");
    expect(html).toContain("Supervisor");
  });
});
