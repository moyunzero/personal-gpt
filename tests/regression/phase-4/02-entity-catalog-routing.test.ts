import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EntityCatalogStore } from "@personal-gpt/shared";
import {
  matchGraphRelationL0,
  matchL0Rules,
  resolveIntentPlan,
  setEntityCatalogStoreForTests,
} from "@personal-gpt/shared/routing";

function createCatalogStore(): EntityCatalogStore {
  return {
    findByWorkspace: vi.fn(async (workspaceId: string) => {
      if (workspaceId !== "ws-phase4") return [];
      return [
        {
          id: "cat-atlas",
          workspaceId,
          normalizedName: "project atlas",
          entityType: "product",
          displayName: "Project Atlas",
          neo4jNodeId: "entity:ws-phase4:project atlas:product",
          sourceDocumentId: "doc-atlas",
        },
      ];
    }),
    findByDocument: vi.fn(async () => []),
    upsert: vi.fn(),
    deleteByDocument: vi.fn(async () => 0),
    ensureWorkspaceReadAcl: vi.fn(),
  };
}

describe("Phase 4 regression #2: entity catalog routing", () => {
  beforeEach(() => {
    setEntityCatalogStoreForTests(createCatalogStore());
  });

  it("graph_relation L0 hits catalog entity without seed regex (D-05)", async () => {
    const query = "Project Atlas 用了什么工艺？";
    expect(query).not.toMatch(/珍珠奶茶/);

    const hit = await matchGraphRelationL0(query, { workspaceId: "ws-phase4" });
    expect(hit).not.toBeNull();
    expect(hit!.primary).toBe("graph_relation");
    expect(hit!.retrieverTools).toEqual(["graph_search"]);
    expect(hit!.reason).toBe("l0:graph_relation:catalog_entity");
    expect(hit!.graphSignal).toBe(true);
  });

  it("matchL0Rules preserves seed fallback for 珍珠奶茶", async () => {
    const seedHit = await matchL0Rules("珍珠奶茶有哪些原料，用了什么工艺？", {
      workspaceId: "ws-phase4",
    });
    expect(seedHit?.primary).toBe("graph_relation");
    expect(seedHit?.reason).toBe("l0:graph_relation:seed_entity");
  });

  it("resolveIntentPlan keeps IntentPlan shape for catalog graph_relation (D-06)", async () => {
    const { plan } = await resolveIntentPlan("Project Atlas 原料关系", {
      workspaceId: "ws-phase4",
    });

    expect(plan).toMatchObject({
      primary: "graph_relation",
      channels: "graph",
      specialists: ["retriever"],
      retrieverTools: ["graph_search"],
      graphSignal: true,
    });
    expect(plan.fallbackChain).toEqual(["kb_search"]);
  });
});
