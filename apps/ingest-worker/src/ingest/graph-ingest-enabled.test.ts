import { describe, expect, it } from "vitest";

import { isGraphIngestEnabled } from "./ingest.processor";

describe("isGraphIngestEnabled", () => {
  it("is true only when ENABLE_GRAPH_RAG=true", () => {
    expect(isGraphIngestEnabled({ ENABLE_GRAPH_RAG: "true" })).toBe(true);
    expect(isGraphIngestEnabled({ ENABLE_GRAPH_RAG: "false" })).toBe(false);
    expect(isGraphIngestEnabled({})).toBe(false);
  });
});
