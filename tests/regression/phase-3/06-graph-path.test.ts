/**
 * Phase 3 regression #6 — Graph path Neo4j (RAG-06 Graph)。
 * 后续由 neo4j GraphRAG 填绿（plan 03-04）。
 * 禁止 live LLM。
 */
import { describe, expect, it } from "vitest";

describe("Phase 3 regression #6: graph path Neo4j (RAG-06 Graph)", () => {
  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  // Filled when neo4j GraphRAG path retrieval lands (plan 03-04)
  it.todo("returns a traceable Neo4j path for graph-backed RAG queries");
});
