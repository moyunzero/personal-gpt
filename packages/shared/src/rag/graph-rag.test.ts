import { describe, expect, it } from "vitest";

import {
  graphRagQuery,
  resolveProductName,
  createSeededMilkTeaFixtureExecutor,
  createCatalogEntityFixtureExecutor,
} from "./graph-rag";
import type { ResolvedGraphEntity } from "../routing/entity-resolve";

describe("resolveProductName", () => {
  it("matches pearl milk tea entities only", () => {
    expect(resolveProductName("珍珠奶茶有哪些原料？")).toBe("珍珠奶茶");
    expect(resolveProductName("pearl milk tea recipe")).toBe("珍珠奶茶");
  });

  it("returns null for unrelated or broad milk-tea queries", () => {
    expect(resolveProductName("心理学有哪些内容？整理给我")).toBeNull();
    expect(resolveProductName("差旅报销政策")).toBeNull();
    expect(resolveProductName("奶茶用了什么工艺？")).toBeNull();
  });
});

describe("graphRagQuery", () => {
  it("returns NO_PATH when question has no seed entity", async () => {
    const result = await graphRagQuery({ question: "心理学有哪些内容？" });
    expect(result.paths).toHaveLength(0);
    expect(result.summary).toMatch(/NO_PATH/);
  });

  it("returns HIT for seed entity via fixture", async () => {
    const result = await graphRagQuery({
      question: "珍珠奶茶用了什么工艺？",
      executor: createSeededMilkTeaFixtureExecutor(),
    });
    expect(result.paths.length).toBeGreaterThan(0);
    expect(result.summary).toMatch(/HIT/);
    expect(result.cypher).toMatch(/Product/);
    expect(result.params).toEqual({ productName: "珍珠奶茶" });
  });

  it("returns HIT for catalog entity via entity_rel_path template", async () => {
    const catalogEntity: ResolvedGraphEntity = {
      source: "catalog",
      displayName: "Project Atlas",
      normalizedName: "project atlas",
      entityType: "concept",
      neo4jNodeId: "entity:ws-1:project atlas:concept",
    };
    const result = await graphRagQuery({
      question: "Project Atlas 与谁有关？",
      workspaceId: "ws-1",
      resolvedEntity: catalogEntity,
      executor: createCatalogEntityFixtureExecutor(),
    });
    expect(result.paths.length).toBeGreaterThan(0);
    expect(result.summary).toMatch(/HIT/);
    expect(result.cypher).toMatch(/Entity/);
    expect(result.params).toEqual({
      workspaceId: "ws-1",
      normalizedName: "project atlas",
      entityType: "concept",
    });
  });

  it("selects seed_product_path for seed resolved entity", async () => {
    const seedEntity: ResolvedGraphEntity = {
      source: "seed",
      displayName: "珍珠奶茶",
      normalizedName: "珍珠奶茶",
      entityType: "product",
    };
    const result = await graphRagQuery({
      question: "珍珠奶茶用了什么工艺？",
      resolvedEntity: seedEntity,
      executor: createSeededMilkTeaFixtureExecutor(),
    });
    expect(result.summary).toMatch(/HIT/);
    expect(result.params).toEqual({ productName: "珍珠奶茶" });
  });
});
