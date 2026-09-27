import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CitationCards from "./CitationCards";

function markup(pages: Array<number | undefined>): string {
  return renderToStaticMarkup(
    createElement(CitationCards, {
      citations: pages.map((page, index) => ({
        documentId: "doc-a",
        title: "手册",
        similarity: 0.8,
        snippet: `段${index}`,
        ...(typeof page === "number" ? { page } : {}),
      })),
    }),
  );
}

describe("CitationCards page", () => {
  it("同一文档两段 page 都是 4 时打开原文链接含第 4 页", () => {
    const html = markup([4, 4]);
    expect(html).toContain("第 4 页");
    expect(html).toContain("#page=4");
  });

  it("同一文档有一段没有 page 时不显示第 4 页", () => {
    expect(markup([4, undefined])).not.toContain("第 4 页");
  });

  it("不为种子资料或缺少文档 id 的引用提供打开原文", () => {
    const seed = renderToStaticMarkup(
      createElement(CitationCards, {
        citations: [
          {
            documentId: "seed-1",
            title: "种子",
            similarity: 0.9,
            snippet: "概述",
            source: "prompt-suggestion",
          },
        ],
      }),
    );
    const unknown = renderToStaticMarkup(
      createElement(CitationCards, {
        citations: [
          {
            documentId: "unknown-0",
            title: "未知",
            similarity: 0.4,
            snippet: "片段",
          },
        ],
      }),
    );
    expect(seed).not.toContain("打开原文");
    expect(unknown).not.toContain("打开原文");
    expect(markup([4])).toContain(encodeURIComponent("doc-a"));
  });
});
