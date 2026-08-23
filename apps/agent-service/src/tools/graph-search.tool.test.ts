/**
 * graph_search 冒烟：经 shared graphRagQuery + fixture（无 live Neo4j / LLM）。
 */
import { describe, expect, it } from "vitest";

describe("graph_search tool", () => {
  it("exposes graph_search and returns a traceable path from fixture", async () => {
    const { graphSearchTool, invokeGraphSearchWithFixture } = await import("./graph-search.tool");
    expect(graphSearchTool.name).toBe("graph_search");

    const out = await invokeGraphSearchWithFixture("珍珠奶茶的珍珠用了什么工艺？");
    expect(out).toMatch(/GRAPH_SEARCH_STATUS: HIT/);
    expect(out).toMatch(/product:pearl-milk-tea/);
    expect(out).toMatch(/ingredient:tapioca/);
    expect(out).toMatch(/method:boil/);
    expect(out).toMatch(/CONTAINS/);
    expect(out).toMatch(/USES/);
  });

  it("returns EMPTY_QUERY for blank question", async () => {
    const { invokeGraphSearch } = await import("./graph-search.tool");
    const out = await invokeGraphSearch({ question: "   " });
    expect(out).toMatch(/EMPTY_QUERY/);
  });

  it("returns NO_PATH for unrelated questions (not default milk tea)", async () => {
    const { invokeGraphSearchWithFixture } = await import("./graph-search.tool");
    const out = await invokeGraphSearchWithFixture("心理学有哪些内容？整理给我");
    expect(out).toMatch(/GRAPH_SEARCH_STATUS: NO_PATH/);
    expect(out).not.toMatch(/product:pearl-milk-tea/);
  });
});
