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

  it("throws when workspaceId is missing", () => {
    expect(() =>
      toChunkRecords(["x"], [[0.1]], {
        workspaceId: "",
        documentId: "doc-1",
      }),
    ).toThrow(/workspaceId/);
  });
});
