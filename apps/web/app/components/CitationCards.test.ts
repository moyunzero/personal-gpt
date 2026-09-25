import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CitationCards from "./CitationCards";

function metaMarkup(pages: Array<number | undefined>): string {
  const html = renderToStaticMarkup(
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
  const start = html.indexOf("citation-card-meta");
  const end = html.indexOf("citation-card-similarity");
  return html.slice(start, end);
}

describe("CitationCards page", () => {
  it("同一文档两段 page 都是 4 时 citation-card-meta 含第 4 页", () => {
    expect(metaMarkup([4, 4])).toContain("第 4 页");
  });

  it("同一文档有一段没有 page 时 citation-card-meta 不含第 4 页", () => {
    expect(metaMarkup([4, undefined])).not.toContain("第 4 页");
  });
});
