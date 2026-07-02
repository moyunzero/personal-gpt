import { describe, it, expect } from "vitest";
import { shouldUseVectorSearch } from "./query-classifier";

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
