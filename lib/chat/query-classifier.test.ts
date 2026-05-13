import { describe, it, expect } from "vitest";
import { shouldUseVectorSearch, detectQuerySource } from "./query-classifier";

describe("shouldUseVectorSearch", () => {
  it("过短的 query 跳过向量检索", () => {
    expect(shouldUseVectorSearch("你好")).toBe(false);
    expect(shouldUseVectorSearch("hi there")).toBe(false);
  });

  it("纯数学算式跳过", () => {
    expect(shouldUseVectorSearch("1 + 2 + 3 = ?")).toBe(false);
    expect(shouldUseVectorSearch("(100 - 50) * 2")).toBe(false);
  });

  it("短的闲聊问候跳过", () => {
    expect(shouldUseVectorSearch("你好啊在吗?")).toBe(false);
    expect(shouldUseVectorSearch("hello 在不在")).toBe(false);
  });

  it("≥10 字符且命中上下文关键词时启用检索", () => {
    // 注意：当前实现下，<10 字符会被规则 1 一律跳过，与关键词无关。
    expect(shouldUseVectorSearch("请详细介绍下你的项目背景")).toBe(true);
    expect(shouldUseVectorSearch("详细聊聊你最近的几个开发作品")).toBe(true);
    expect(shouldUseVectorSearch("如何使用 vector search 做相似度检索")).toBe(true);
  });

  it("长度 >30 且无任何关键词时默认启用", () => {
    const neutralLong = "请帮我把这段超长的中文翻译成英文并完整保留所有标点符号格式细节谢谢配合";
    expect(shouldUseVectorSearch(neutralLong)).toBe(true);
  });

  it("长度 10–19 且命中闲聊关键词 -> 跳过", () => {
    expect(shouldUseVectorSearch("你好啊在吗最近还好吗")).toBe(false);
  });
});

describe("detectQuerySource", () => {
  it("命中项目名直接返回 prompt-suggestion", () => {
    expect(detectQuerySource("心晴 app 是什么")).toBe("prompt-suggestion");
    expect(detectQuerySource("修仙游戏怎么玩")).toBe("prompt-suggestion");
    expect(detectQuerySource("xinqing 项目介绍")).toBe("prompt-suggestion");
  });

  it("命中个人关键词返回 prompt-suggestion", () => {
    expect(detectQuerySource("介绍下你自己")).toBe("prompt-suggestion");
    expect(detectQuerySource("你的开发背景")).toBe("prompt-suggestion");
    expect(detectQuerySource("moyun 是谁")).toBe("prompt-suggestion");
  });

  it("命中心理学关键词返回 psychology-qa", () => {
    expect(detectQuerySource("怎么缓解焦虑")).toBe("psychology-qa");
    expect(detectQuerySource("最近压力很大")).toBe("psychology-qa");
    expect(detectQuerySource("心理咨询有用吗")).toBe("psychology-qa");
  });

  it("无任何匹配返回 all", () => {
    expect(detectQuerySource("帮我写一首关于秋天的诗")).toBe("all");
    expect(detectQuerySource("1 加 1 等于几")).toBe("all");
  });

  it("项目名优先级高于其他关键词冲突", () => {
    // 同时包含"心晴"(项目) 和"焦虑"(心理)，应返回 prompt-suggestion
    expect(detectQuerySource("心晴 app 能缓解焦虑吗")).toBe("prompt-suggestion");
  });
});
