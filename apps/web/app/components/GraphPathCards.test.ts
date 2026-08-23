import { describe, expect, it } from "vitest";

import { graphPathsToDisplay } from "@/lib/chat/graph-path-display";

describe("graphPathsToDisplay (D-07)", () => {
  it("formats human-readable nodes without cypher", () => {
    const display = graphPathsToDisplay([
      {
        nodes: [
          {
            id: "product:pearl-milk-tea",
            labels: ["Product"],
            properties: { name: "珍珠奶茶" },
          },
          {
            id: "ingredient:tapioca",
            labels: ["Ingredient"],
            properties: { name: "珍珠" },
          },
          {
            id: "method:boil",
            labels: ["Method"],
            properties: { name: "煮制" },
          },
        ],
        relationships: [{ type: "CONTAINS" }, { type: "USES" }],
      },
    ]);

    expect(display).toHaveLength(1);
    expect(display[0]!.nodes).toEqual(["Product:珍珠奶茶", "Ingredient:珍珠", "Method:煮制"]);
    expect(display[0]!.relationships).toEqual(["CONTAINS", "USES"]);

    const serialized = JSON.stringify(display);
    expect(serialized).not.toMatch(/cypher/i);
    expect(serialized).not.toMatch(/MATCH/i);
  });
});
