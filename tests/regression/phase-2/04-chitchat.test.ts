/**
 * Phase 2 regression #4 — 闲聊不启全图（D-03 / D-17）。
 * 生产路径：streamChat 用 resolveAgentRoute === "short" + buildShortReplyMessages，
 * 不再编译已删除的 buildAgentGraph 外层短路图。
 * 禁止 live LLM。
 */
import { describe, expect, it } from "vitest";

import { resolveAgentRoute } from "../../../apps/agent-service/src/graph/build-graph";
import {
  buildShortReplyMessages,
  isAgentChitchat,
} from "../../../apps/agent-service/src/graph/short-circuit";

describe("Phase 2 regression #4: chitchat skips full multi-agent graph (D-03/D-17)", () => {
  it("routes 今天天气怎么样 to short (production gate)", () => {
    expect(isAgentChitchat("今天天气怎么样")).toBe(true);
    expect(resolveAgentRoute("今天天气怎么样")).toBe("short");
  });

  it("short-circuit reply has content without invoking Supervisor/LLM", () => {
    const msgs = buildShortReplyMessages("今天天气怎么样");
    expect(msgs.length).toBeGreaterThan(0);
    const last = msgs.at(-1);
    const content = typeof last?.content === "string" ? last.content : String(last?.content ?? "");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toMatch(/闲聊|短路|调研|知识库|助手|天气/);
  });

  it("non-chitchat stays on supervisor route (full graph path)", () => {
    expect(isAgentChitchat("请根据知识库总结差旅报销政策并列出条款出处")).toBe(false);
    expect(resolveAgentRoute("请根据知识库总结差旅报销政策并列出条款出处")).toBe("supervisor");
  });
});
