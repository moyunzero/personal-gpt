/**
 * Phase 3 regression #6 — Graph path Neo4j (RAG-06 Graph)。
 * 使用 shared 种子 fixture executor（无 live Neo4j / LLM）。
 */
import { describe, expect, it } from "vitest";

import { createSeededMilkTeaFixtureExecutor, graphRagQuery } from "@personal-gpt/shared";

describe("Phase 3 regression #6: graph path Neo4j (RAG-06 Graph)", () => {
  it("returns a traceable Neo4j path for graph-backed RAG queries (no live LLM)", async () => {
    const result = await graphRagQuery({
      question: "珍珠奶茶的珍珠用了什么工艺？",
      executor: createSeededMilkTeaFixtureExecutor(),
    });

    expect(result.paths.length).toBeGreaterThan(0);
    const path = result.paths[0]!;
    const nodeIds = path.nodes.map((n) => n.id);
    const relTypes = path.relationships.map((r) => r.type);

    expect(nodeIds).toEqual(
      expect.arrayContaining(["product:pearl-milk-tea", "ingredient:tapioca", "method:boil"]),
    );
    expect(relTypes).toEqual(expect.arrayContaining(["CONTAINS", "USES"]));
    expect(result.summary).toMatch(/GRAPH_RAG_STATUS: HIT/);
    expect(result.cypher).toMatch(/MATCH/i);
    expect(result.cypher).toMatch(/RETURN/i);
  });
});
