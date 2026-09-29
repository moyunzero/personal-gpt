import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  resolveGraphEntity,
  setEntityCatalogStoreForTests,
  type EntityCatalogStore,
} from "./entity-resolve";

function createMockStore(
  rows: Array<{
    id: string;
    workspaceId: string;
    normalizedName: string;
    entityType: "product";
    displayName: string;
    neo4jNodeId: string;
    sourceDocumentId: string;
  }>,
): EntityCatalogStore {
  return {
    findByWorkspace: vi.fn(async (workspaceId: string) =>
      rows.filter((row) => row.workspaceId === workspaceId),
    ),
    findByDocument: vi.fn(async () => []),
    upsert: vi.fn(),
    deleteByDocument: vi.fn(async () => 0),
    ensureWorkspaceReadAcl: vi.fn(),
  };
}

describe("resolveGraphEntity", () => {
  const workspaceId = "ws-catalog-1";

  beforeEach(() => {
    setEntityCatalogStoreForTests(null);
  });

  it("returns catalog hit before seed when workspaceId provided", async () => {
    const store = createMockStore([
      {
        id: "cat-1",
        workspaceId,
        normalizedName: "project atlas",
        entityType: "product",
        displayName: "Project Atlas",
        neo4jNodeId: "entity:ws-catalog-1:project atlas:product",
        sourceDocumentId: "doc-1",
      },
    ]);
    setEntityCatalogStoreForTests(store);

    const hit = await resolveGraphEntity("Project Atlas 用了什么工艺？", workspaceId);
    expect(hit).toMatchObject({
      source: "catalog",
      displayName: "Project Atlas",
      normalizedName: "project atlas",
    });
  });

  it("falls back to seed 珍珠奶茶 when catalog misses", async () => {
    const store = createMockStore([]);
    setEntityCatalogStoreForTests(store);

    const hit = await resolveGraphEntity("珍珠奶茶有哪些原料，用了什么工艺？", workspaceId);
    expect(hit).toMatchObject({
      source: "seed",
      displayName: "珍珠奶茶",
    });
  });

  it("denies all catalog hits when allowedDocumentIds is empty array (D-21)", async () => {
    const store = createMockStore([
      {
        id: "cat-deny",
        workspaceId,
        normalizedName: "project atlas",
        entityType: "product",
        displayName: "Project Atlas",
        neo4jNodeId: "entity:ws-catalog-1:project atlas:product",
        sourceDocumentId: "doc-secret",
      },
    ]);
    setEntityCatalogStoreForTests(store);

    const hit = await resolveGraphEntity("Project Atlas 用了什么工艺？", workspaceId, {
      allowedDocumentIds: [],
    });
    // Catalog path must be empty (fail-closed); seed does not match this query
    expect(hit).toBeNull();
  });

  it("still returns unfiltered catalog hits when allowedDocumentIds is undefined", async () => {
    const store = createMockStore([
      {
        id: "cat-open",
        workspaceId,
        normalizedName: "project atlas",
        entityType: "product",
        displayName: "Project Atlas",
        neo4jNodeId: "entity:ws-catalog-1:project atlas:product",
        sourceDocumentId: "doc-1",
      },
    ]);
    setEntityCatalogStoreForTests(store);

    const hit = await resolveGraphEntity("Project Atlas 用了什么工艺？", workspaceId, {
      allowedDocumentIds: undefined,
    });
    expect(hit).toMatchObject({ source: "catalog", displayName: "Project Atlas" });
  });

  it("filters catalog by non-empty allowlist sourceDocumentId", async () => {
    const store = createMockStore([
      {
        id: "cat-a",
        workspaceId,
        normalizedName: "project atlas",
        entityType: "product",
        displayName: "Project Atlas",
        neo4jNodeId: "entity:ws-catalog-1:project atlas:product",
        sourceDocumentId: "doc-allowed",
      },
    ]);
    setEntityCatalogStoreForTests(store);

    const denied = await resolveGraphEntity("Project Atlas 用了什么工艺？", workspaceId, {
      allowedDocumentIds: ["other-doc"],
    });
    expect(denied).toBeNull();

    const allowed = await resolveGraphEntity("Project Atlas 用了什么工艺？", workspaceId, {
      allowedDocumentIds: ["doc-allowed"],
    });
    expect(allowed).toMatchObject({ source: "catalog", displayName: "Project Atlas" });
  });

  it("keeps seed fallback after empty-allowlist catalog deny (D-05 coexistence)", async () => {
    const store = createMockStore([
      {
        id: "cat-seed-mask",
        workspaceId,
        normalizedName: "珍珠奶茶",
        entityType: "product",
        displayName: "珍珠奶茶",
        neo4jNodeId: "entity:ws:珍珠奶茶:product",
        sourceDocumentId: "doc-forbidden",
      },
    ]);
    setEntityCatalogStoreForTests(store);

    const hit = await resolveGraphEntity("珍珠奶茶有哪些原料？", workspaceId, {
      allowedDocumentIds: [],
    });
    expect(hit).toMatchObject({
      source: "seed",
      displayName: "珍珠奶茶",
    });
  });
});
