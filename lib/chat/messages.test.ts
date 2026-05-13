import { describe, expect, it } from "vitest";

import { formatMessages, type InputMessage } from "./messages";

describe("formatMessages", () => {
  it("拼接 UIMessage 的 text parts", () => {
    const input: InputMessage[] = [
      {
        role: "user",
        parts: [
          { type: "text", text: "你好" },
          { type: "text", text: "MoYun" },
        ],
      },
    ];

    expect(formatMessages(input)).toEqual([{ role: "user", content: "你好MoYun" }]);
  });

  it("丢弃非 text 类型的 part", () => {
    const input: InputMessage[] = [
      {
        role: "user",
        parts: [
          { type: "text", text: "看图" },
          { type: "image", text: "https://example.com/cat.png" },
        ],
      },
    ];

    expect(formatMessages(input)).toEqual([{ role: "user", content: "看图" }]);
  });

  it("回落到 content 字段（无 parts 的旧格式）", () => {
    const input: InputMessage[] = [{ role: "assistant", content: "  在的  " }];

    expect(formatMessages(input)).toEqual([{ role: "assistant", content: "在的" }]);
  });

  it("既无 parts 又无 content 时 content 为空串", () => {
    const input: InputMessage[] = [{ role: "user" }];

    expect(formatMessages(input)).toEqual([{ role: "user", content: "" }]);
  });

  it("保留多条消息的顺序", () => {
    const input: InputMessage[] = [
      { role: "user", content: "1" },
      { role: "assistant", content: "2" },
      { role: "user", content: "3" },
    ];

    expect(formatMessages(input).map((m) => m.content)).toEqual(["1", "2", "3"]);
  });

  it("parts 优先于 content（同时存在时只取 parts）", () => {
    const input: InputMessage[] = [
      {
        role: "user",
        parts: [{ type: "text", text: "from parts" }],
        content: "from content",
      },
    ];

    expect(formatMessages(input)).toEqual([{ role: "user", content: "from parts" }]);
  });

  it("未识别的 role 降级为 user（避免 tool / function 等中间态泄漏）", () => {
    const input: InputMessage[] = [
      { role: "tool", content: "tool output" },
      { role: "function", content: "fn output" },
      { role: "system", content: "sys msg" },
    ];

    expect(formatMessages(input).map((m) => m.role)).toEqual([
      "user",
      "user",
      "system",
    ]);
  });
});
