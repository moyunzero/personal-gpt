import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ExtractedEntity } from "./extract-entities";
import {
  deleteCatalogForDocument,
  findCatalogEntitiesInQuery,
  upsertCatalogEntries,
  type EntityCatalogRecord,
  type EntityCatalogStore,
} from "./entity-catalog";

function makeEntity(overrides: Partial<ExtractedEntity> = {}): ExtractedEntity {
  return {
    name: "Acme Corp",
    normalizedName: "acme corp",
    entityType: "org",
    ...overrides,
  };
}

function makeRecord(overrides: Partial<EntityCatalogRecord> = {}): EntityCatalogRecord {
  return {
    id: "cat-1",
    workspaceId: "ws-1",
    normalizedName: "acme corp",
    entityType: "org",
    displayName: "Acme Corp",
    neo4jNodeId: "entity:ws-1:acme corp:org",
    sourceDocumentId: "doc-1",
    ...overrides,
  };
}

function createMockStore(initial: EntityCatalogRecord[] = []): EntityCatalogStore {
  const catalog = [...initial];
  const aclRows: Array<{
    workspaceId: string;
    entityCatalogId: string;
    principalType: string;
    principalId: string;
    permission: string;
  }> = [];

  return {
    findByWorkspace: vi.fn(async (workspaceId: string) =>
      catalog.filter((row) => row.workspaceId === workspaceId),
    ),
    findByDocument: vi.fn(async (workspaceId: string, documentId: string) =>
      catalog.filter(
        (row) => row.workspaceId === workspaceId && row.sourceDocumentId === documentId,
      ),
    ),
    upsert: vi.fn(async (row: Omit<EntityCatalogRecord, "id"> & { id?: string }) => {
      const idx = catalog.findIndex(
        (existing) =>
          existing.workspaceId === row.workspaceId &&
          existing.normalizedName === row.normalizedName &&
          existing.entityType === row.entityType,
      );
      const saved: EntityCatalogRecord = {
        id: row.id ?? `cat-${catalog.length + 1}`,
        workspaceId: row.workspaceId,
        normalizedName: row.normalizedName,
        entityType: row.entityType,
        displayName: row.displayName,
        neo4jNodeId: row.neo4jNodeId,
        sourceDocumentId: row.sourceDocumentId,
      };
      if (idx >= 0) {
        catalog[idx] = saved;
      } else {
        catalog.push(saved);
      }
      return saved;
    }),
    deleteByDocument: vi.fn(async (workspaceId: string, documentId: string) => {
      const removed = catalog.filter(
        (row) => row.workspaceId === workspaceId && row.sourceDocumentId === documentId,
      );
      for (let i = catalog.length - 1; i >= 0; i -= 1) {
        if (catalog[i]!.workspaceId === workspaceId && catalog[i]!.sourceDocumentId === documentId) {
          catalog.splice(i, 1);
        }
      }
      return removed.length;
    }),
    ensureWorkspaceReadAcl: vi.fn(
      async (workspaceId: string, entityCatalogId: string) => {
        aclRows.push({
          workspaceId,
          entityCatalogId,
          principalType: "workspace",
          principalId: workspaceId,
          permission: "read",
        });
      },
    ),
    getAclRows: () => aclRows,
  };
}

describe("upsertCatalogEntries", () => {
  it("inserts catalog rows with normalized keys and neo4j ids", async () => {
    const store = createMockStore();
    const entities = [makeEntity(), makeEntity({ name: "Bob", normalizedName: "bob", entityType: "person" })];

    await upsertCatalogEntries(
      { workspaceId: "ws-1", documentId: "doc-1", entities },
      store,
    );

    expect(store.upsert).toHaveBeenCalledTimes(2);
    expect(store.ensureWorkspaceReadAcl).toHaveBeenCalledTimes(2);
    const rows = await store.findByDocument("ws-1", "doc-1");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.neo4jNodeId).toBe("entity:ws-1:acme corp:org");
  });
});

describe("deleteCatalogForDocument", () => {
  it("removes catalog rows for documentId+workspaceId", async () => {
    const store = createMockStore([
      makeRecord(),
      makeRecord({ id: "cat-2", sourceDocumentId: "doc-2" }),
    ]);

    const removed = await deleteCatalogForDocument("ws-1", "doc-1", store);

    expect(removed).toBe(1);
    expect(await store.findByDocument("ws-1", "doc-1")).toHaveLength(0);
    expect(await store.findByDocument("ws-1", "doc-2")).toHaveLength(1);
  });
});

describe("findCatalogEntitiesInQuery", () => {
  let store: EntityCatalogStore;

  beforeEach(() => {
    store = createMockStore([
      makeRecord(),
      makeRecord({
        id: "cat-2",
        normalizedName: "project atlas",
        displayName: "Project Atlas",
        entityType: "concept",
        neo4jNodeId: "entity:ws-1:project atlas:concept",
      }),
    ]);
  });

  it("returns hits on exact normalized substring match in query", async () => {
    const hits = await findCatalogEntitiesInQuery("ws-1", "Tell me about Acme Corp suppliers", store);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.displayName).toBe("Acme Corp");
  });

  it("does not fuzzy-match partial tokens", async () => {
    const hits = await findCatalogEntitiesInQuery("ws-1", "acme suppliers", store);
    expect(hits).toHaveLength(0);
  });

  it("filters by workspace_id only", async () => {
    const hits = await findCatalogEntitiesInQuery("ws-other", "Acme Corp", store);
    expect(hits).toHaveLength(0);
  });
});
