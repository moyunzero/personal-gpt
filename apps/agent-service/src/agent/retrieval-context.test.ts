import { describe, expect, it } from "vitest";

import { parseRetrievalContextFromHeaders } from "./retrieval-context";

describe("parseRetrievalContextFromHeaders", () => {
  it("returns empty allowedDocumentIds when header is empty string", () => {
    const ctx = parseRetrievalContextFromHeaders({
      "x-user-id": "user-1",
      "x-workspace-id": "ws-1",
      "x-allowed-document-ids": "",
    });
    expect(ctx.allowedDocumentIds).toEqual([]);
  });

  it("parses single document id", () => {
    const ctx = parseRetrievalContextFromHeaders({
      "x-allowed-document-ids": "doc-a",
    });
    expect(ctx.allowedDocumentIds).toEqual(["doc-a"]);
  });

  it("splits comma-separated ids and trims whitespace", () => {
    const ctx = parseRetrievalContextFromHeaders({
      "x-user-id": "u",
      "x-workspace-id": "w",
      "x-allowed-document-ids": " doc-a ,doc-b,  doc-c ",
    });
    expect(ctx).toEqual({
      userId: "u",
      workspaceId: "w",
      allowedDocumentIds: ["doc-a", "doc-b", "doc-c"],
    });
  });

  it("uses fallback workspace and user when headers absent", () => {
    const ctx = parseRetrievalContextFromHeaders({}, {
      workspaceId: "ws-fallback",
      userId: "user-fallback",
    });
    expect(ctx.workspaceId).toBe("ws-fallback");
    expect(ctx.userId).toBe("user-fallback");
    expect(ctx.allowedDocumentIds).toEqual([]);
  });
});
