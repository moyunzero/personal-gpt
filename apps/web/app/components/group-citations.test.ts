import { describe, expect, it } from "vitest";

import { groupCitationsByDocument } from "./group-citations";

describe("groupCitationsByDocument", () => {
  it("groups two snippets from the same document into one card", () => {
    const groups = groupCitationsByDocument([
      {
        documentId: "doc-a",
        title: "手册",
        similarity: 0.8,
        snippet: "第一段",
        chunkIndex: 0,
      },
      {
        documentId: "doc-a",
        title: "手册",
        similarity: 0.91,
        snippet: "第二段",
        chunkIndex: 2,
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe("手册");
    expect(groups[0]?.similarity).toBe(0.91);
    expect(groups[0]?.snippets.map((item) => item.snippet)).toEqual(["第一段", "第二段"]);
    expect(groups[0]?.snippets.map((item) => item.sourceNumber)).toEqual([1, 2]);
  });

  it("keeps different documentIds as separate cards in first-seen order", () => {
    const groups = groupCitationsByDocument([
      {
        documentId: "doc-b",
        title: "后出现的标题不应提前",
        similarity: 0.7,
        snippet: "乙",
      },
      {
        documentId: "doc-a",
        title: "甲",
        similarity: 0.95,
        snippet: "甲段",
      },
      {
        documentId: "unknown-0",
        title: "未命名文档",
        similarity: 0.6,
        snippet: "无名",
      },
    ]);

    expect(groups.map((group) => group.documentId)).toEqual(["doc-b", "doc-a", "unknown-0"]);
    expect(groups[0]?.snippets).toHaveLength(1);
    expect(groups[1]?.snippets).toHaveLength(1);
  });
});
