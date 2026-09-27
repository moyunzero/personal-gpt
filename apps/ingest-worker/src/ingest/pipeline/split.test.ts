import { describe, expect, it } from "vitest";

import { INGEST_CHUNK_DEFAULTS } from "../../../../../packages/shared/src/utils/ingest";

import { splitText, toChunkRecords } from "./split";

const LONG_TEXT = "word ".repeat(500);

describe("splitText", () => {
  it("produces at least 2 chunks for long text with overlap", async () => {
    const chunks = await splitText(LONG_TEXT);

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(INGEST_CHUNK_DEFAULTS.chunkSize + 50);
    }

    if (chunks.length >= 2) {
      const tail = chunks[0]!.slice(-INGEST_CHUNK_DEFAULTS.chunkOverlap);
      const head = chunks[1]!.slice(0, INGEST_CHUNK_DEFAULTS.chunkOverlap);
      expect(head).toContain(tail.trim().split(" ").pop() ?? "");
    }
  });
});

describe("toChunkRecords", () => {
  it("includes workspaceId and documentId on every record", () => {
    const chunks = ["alpha", "beta"];
    const vectors = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];

    const records = toChunkRecords(chunks, vectors, {
      workspaceId: "ws-11111111-1111-1111-1111-111111111111",
      documentId: "doc-22222222-2222-2222-2222-222222222222",
      title: "Fixture",
    });

    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.workspaceId).toBe("ws-11111111-1111-1111-1111-111111111111");
      expect(record.documentId).toBe("doc-22222222-2222-2222-2222-222222222222");
    }
  });

  it("writes metadata.page only when the page number is finite", () => {
    const withPage = toChunkRecords(
      ["alpha"],
      [[0.1]],
      {
        workspaceId: "ws-1",
        documentId: "doc-1",
      },
      [3],
    );
    expect(withPage[0]?.metadata).toEqual({ page: 3 });

    const without = toChunkRecords(["alpha"], [[0.1]], {
      workspaceId: "ws-1",
      documentId: "doc-1",
    });
    expect(without[0]).not.toHaveProperty("metadata");

    const missingPage = toChunkRecords(
      ["alpha"],
      [[0.1]],
      {
        workspaceId: "ws-1",
        documentId: "doc-1",
      },
      [Number.NaN],
    );
    expect(missingPage[0]).not.toHaveProperty("metadata");
  });

  it("throws when workspaceId is missing", () => {
    expect(() =>
      toChunkRecords(["x"], [[0.1]], {
        workspaceId: "",
        documentId: "doc-1",
      }),
    ).toThrow(/workspaceId/);
  });
});

describe("splitPdfPages", () => {
  it("keeps each page in its own chunks", async () => {
    const { splitPdfPages } = await import("./split");
    const chunks = await splitPdfPages([
      { num: 1, text: "只有第一页。" },
      { num: 2, text: "只有第二页。" },
    ]);
    expect(chunks.map((chunk) => chunk.page)).toEqual([1, 2]);
    expect(chunks[0]?.text).not.toContain("第二页");
    expect(chunks[1]?.text).not.toContain("第一页");
  });

  it("keeps the same page when one page exceeds the chunk size", async () => {
    const { splitPdfPages } = await import("./split");
    const chunks = await splitPdfPages([{ num: 7, text: "甲".repeat(2000) }]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.page === 7)).toBe(true);
    expect(chunks.every((chunk) => !/\d+ of \d+/.test(chunk.text))).toBe(true);
  });

  it("splits on an outline title and keeps a short table together", async () => {
    const { splitPdfPages } = await import("./split");
    const headed = await splitPdfPages([{ num: 4, text: "引言\n正文\n第二章\n后文" }], ["第二章"]);
    expect(headed[1]?.text.startsWith("第二章")).toBe(true);

    const table = await splitPdfPages([{ num: 1, text: "A\t1\t2\nB\t3\t4" }]);
    expect(table).toHaveLength(1);
    expect(table[0]?.text).toContain("\t");
  });

  it("does not split a lorem page on sentence boundaries", async () => {
    const { splitPdfPages } = await import("./split");
    const lorem = "Lorem ipsum dolor sit amet. Sed ut perspiciatis. Unde omnis iste natus.";
    const chunks = await splitPdfPages([{ num: 8, text: lorem }]);
    expect(chunks).toEqual([{ text: lorem, page: 8 }]);
  });

  it("splits chapter and numbered headings, and leaves a short prose line intact", async () => {
    const { splitPdfPages } = await import("./split");
    const chunks = await splitPdfPages([
      {
        num: 6,
        text: "开场\n第一章 引言\n正文\nManagement discussion\n继续\n1.2 标题\n结尾",
      },
    ]);
    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "开场",
      "第一章 引言\n正文\nManagement discussion\n继续",
      "1.2 标题\n结尾",
    ]);
    expect(chunks.every((chunk) => chunk.page === 6)).toBe(true);
  });

  it("prefers an exact outline title over a short chapter line", async () => {
    const { splitPdfPages } = await import("./split");
    const chunks = await splitPdfPages(
      [{ num: 9, text: "前言\nReal Title\n正文\n第一章 不应切\n尾" }],
      ["Real Title"],
    );
    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "前言",
      "Real Title\n正文\n第一章 不应切\n尾",
    ]);
  });

  it("splits a long table on row boundaries without breaking spaced numbers", async () => {
    const { splitPdfPages } = await import("./split");
    const row = "100 200\t300 400\t500 600";
    const chunks = await splitPdfPages([
      { num: 3, text: Array.from({ length: 50 }, () => row).join("\n") },
    ]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.page).toBe(3);
      expect(chunk.text.split("\n").every((line) => line === row)).toBe(true);
    }
  });
});
