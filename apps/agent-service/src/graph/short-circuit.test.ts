import { describe, expect, it } from "vitest";

import {
  buildShortReplyMessages,
  isAgentChitchat,
} from "./short-circuit";

describe("isAgentChitchat (D-03/D-17)", () => {
  it('returns true for greeting "你好"', () => {
    expect(isAgentChitchat("你好")).toBe(true);
  });

  it("returns true for greeting with punctuation", () => {
    expect(isAgentChitchat("你好！")).toBe(true);
    expect(isAgentChitchat("Hello")).toBe(true);
  });

  it("returns true for too-short / blank input", () => {
    expect(isAgentChitchat("")).toBe(true);
    expect(isAgentChitchat("   ")).toBe(true);
    expect(isAgentChitchat("嗯")).toBe(true);
    expect(isAgentChitchat("a")).toBe(true);
  });

  it("returns true for casual weather chitchat", () => {
    expect(isAgentChitchat("今天天气怎么样")).toBe(true);
  });

  it("returns false for clear research / KB queries", () => {
    expect(
      isAgentChitchat(
        "请根据知识库总结我们公司的差旅报销政策，并列出关键条款与出处",
      ),
    ).toBe(false);
    expect(
      isAgentChitchat(
        "对比三家供应商的报价方案，输出结构化分析报告",
      ),
    ).toBe(false);
  });
});

describe("buildShortReplyMessages", () => {
  it("returns a polite Chinese short reply as assistant message content", () => {
    const msgs = buildShortReplyMessages("你好");
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    const last = msgs[msgs.length - 1];
    expect(last).toBeTruthy();
    const content =
      typeof last.content === "string"
        ? last.content
        : JSON.stringify(last.content);
    expect(content.length).toBeGreaterThan(0);
    expect(content).toMatch(/你好|有什么|帮|聊聊|问题/);
  });
});
