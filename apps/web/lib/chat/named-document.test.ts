import { describe, expect, it } from "vitest";

import {
  focusTableRow,
  matchNamedDocument,
  matchNamedDocuments,
  normalizeDocLabel,
  pageAsked,
} from "./named-document";

const docs = [
  { id: "pdf-1mb", title: "sample-pdf-1mb" },
  { id: "pdf-tiny", title: "sample-pdf-tiny" },
  { id: "notes", title: "哈佛家训" },
];

describe("matchNamedDocument", () => {
  it("strips a file extension from the stored title", () => {
    expect(normalizeDocLabel("sample-pdf-1mb.PDF")).toBe("sample-pdf-1mb");
  });

  it("picks the document whose title appears in the question", () => {
    expect(matchNamedDocument("sample-pdf-1mb文件讲的什么", docs)).toEqual({
      id: "pdf-1mb",
      title: "sample-pdf-1mb",
    });
  });

  it("prefers the longer title when two names are nested", () => {
    expect(
      matchNamedDocument("请总结 sample-pdf-tiny", [
        { id: "short", title: "sample-pdf" },
        { id: "tiny", title: "sample-pdf-tiny" },
      ]),
    ).toEqual({ id: "tiny", title: "sample-pdf-tiny" });
  });

  it("returns both documents when the question names two titles", () => {
    expect(matchNamedDocuments("对比 sample-pdf-1mb 和 哈佛家训", docs)).toEqual([
      { id: "pdf-1mb", title: "sample-pdf-1mb" },
      { id: "notes", title: "哈佛家训" },
    ]);
  });

  it("reads a page number", () => {
    expect(pageAsked("第 12 页的批发收入")).toBe(12);
    expect(pageAsked("讲什么")).toBeNull();
  });

  it("keeps the table row that matches the question", () => {
    const text = "说明\nWholesale revenue\t15210526\t14476818\nOther\t1\t2";
    expect(focusTableRow("Wholesale revenue 是多少", text)).toBe(
      "Wholesale revenue\t15210526\t14476818",
    );
  });
});
