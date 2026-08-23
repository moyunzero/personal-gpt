import { describe, expect, it } from "vitest";

import { formatGraphAnswerFromToolOutput } from "./graph-answer-format";

const SAMPLE_HIT = [
  "GRAPH_SEARCH_STATUS: HIT",
  "GRAPH_RAG_STATUS: HIT",
  "cypher: MATCH path = (p:Product {name: $productName})-[:CONTAINS]->(i:Ingredient)-[:USES]->(m:Method)",
  "[path 1]",
  "nodes:",
  "  - id=product:pearl-milk-tea labels=Product name=珍珠奶茶",
  "  - id=ingredient:tapioca labels=Ingredient name=珍珠",
  "  - id=method:boil labels=Method name=煮制",
  "relationships:",
  "  - product:pearl-milk-tea -[CONTAINS]-> ingredient:tapioca",
  "  - ingredient:tapioca -[USES]-> method:boil",
].join("\n");

describe("formatGraphAnswerFromToolOutput", () => {
  it("formats HIT graph output with Chinese names and summary", () => {
    const out = formatGraphAnswerFromToolOutput(SAMPLE_HIT, "珍珠奶茶有哪些原料？");
    expect(out).toMatch(/珍珠奶茶.*包含.*珍珠/);
    expect(out).toMatch(/珍珠.*采用.*煮制/);
    expect(out).toMatch(/珍珠奶茶 → 包含 → 珍珠/);
    expect(out).toMatch(/珍珠 → 采用 → 煮制/);
    expect(out).not.toMatch(/product:pearl-milk-tea/);
    expect(out).not.toMatch(/cypher/i);
    expect(out).not.toMatch(/\[:CONTAINS\]/);
  });

  it("returns empty for NO_PATH", () => {
    expect(formatGraphAnswerFromToolOutput("GRAPH_SEARCH_STATUS: NO_PATH", "q")).toBe("");
  });

  it("formats multiline path blocks when structured nodes are absent", () => {
    const raw = [
      "GRAPH_SEARCH_STATUS: HIT",
      "[path 1]",
      "nodes:",
      "  product:pearl-milk-tea -[CONTAINS]-> ingredient:tapioca",
    ].join("\n");
    const out = formatGraphAnswerFromToolOutput(raw, "珍珠奶茶有哪些原料？");
    expect(out).toContain("product:pearl-milk-tea");
    expect(out).toContain("CONTAINS");
  });
});
