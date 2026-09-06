import { beforeEach, describe, expect, it, vi } from "vitest";

import { type EntityCatalogRecord, type EntityCatalogStore } from "@personal-gpt/shared";
import { resolveGraphEntity, setEntityCatalogStoreForTests } from "@personal-gpt/shared/routing";

const deleteGraphMock = vi.fn();
const deleteCatalogMock = vi.fn().mockResolvedValue(1);

vi.mock("@personal-gpt/shared/stores/vector-store", () => ({
  shouldWriteAstra: () => false,
  shouldWriteMilvus: () => false,
}));

vi.mock("@personal-gpt/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@personal-gpt/shared")>();
  return {
    ...actual,
    deleteGraphForDocument: (...args: unknown[]) => deleteGraphMock(...args),
    deleteCatalogForDocument: (...args: unknown[]) => deleteCatalogMock(...args),
  };
});

vi.mock("../../../apps/ingest-worker/src/ingest/pipeline/es-upsert", () => ({
  deleteDocumentFromEs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../apps/ingest-worker/src/ingest/entity-catalog-store", () => ({
  createEntityCatalogStore: vi.fn(() => ({ deleteByDocument: vi.fn() })),
}));

import { deleteDocument } from "../../../apps/ingest-worker/src/ingest/pipeline/delete";

function createCatalogStore(initial: EntityCatalogRecord[]): EntityCatalogStore {
  let rows = [...initial];
  return {
    findByWorkspace: vi.fn(async (workspaceId: string) =>
      rows.filter((row) => row.workspaceId === workspaceId),
    ),
    findByDocument: vi.fn(async (workspaceId: string, documentId: string) =>
      rows.filter((row) => row.workspaceId === workspaceId && row.sourceDocumentId === documentId),
    ),
    upsert: vi.fn(),
    deleteByDocument: vi.fn(async (workspaceId: string, documentId: string) => {
      const before = rows.length;
      rows = rows.filter(
        (row) => !(row.workspaceId === workspaceId && row.sourceDocumentId === documentId),
      );
      return before - rows.length;
    }),
    ensureWorkspaceReadAcl: vi.fn(),
  };
}

describe("Phase 4 regression #3: graph lifecycle sync (GRAPH-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEntityCatalogStoreForTests(null);
    deleteGraphMock.mockResolvedValue(undefined);
  });

  it("ingest-worker deleteDocument invokes graph and catalog cleanup", async () => {
    const mockDataSource = {} as import("typeorm").DataSource;

    await deleteDocument("ws-1", "doc-1", "user", { dataSource: mockDataSource });

    expect(deleteGraphMock).toHaveBeenCalledWith("ws-1", "doc-1");
    expect(deleteCatalogMock).toHaveBeenCalledWith("ws-1", "doc-1", expect.any(Object));
  });

  it("graph delete failure surfaces via AggregateError (D-09)", async () => {
    deleteGraphMock.mockRejectedValue(new Error("neo4j down"));

    await expect(deleteDocument("ws-1", "doc-1", "user")).rejects.toBeInstanceOf(AggregateError);
  });

  it("deleteCatalogForDocument removes rows scoped to workspaceId+documentId", async () => {
    const { deleteCatalogForDocument } =
      await vi.importActual<typeof import("@personal-gpt/shared")>("@personal-gpt/shared");
    const store = createCatalogStore([
      {
        id: "cat-a",
        workspaceId: "ws-a",
        normalizedName: "project atlas",
        entityType: "product",
        displayName: "Project Atlas",
        neo4jNodeId: "entity:ws-a:project atlas:product",
        sourceDocumentId: "doc-a",
      },
      {
        id: "cat-b",
        workspaceId: "ws-a",
        normalizedName: "other",
        entityType: "product",
        displayName: "Other",
        neo4jNodeId: "entity:ws-a:other:product",
        sourceDocumentId: "doc-b",
      },
    ]);

    const removed = await deleteCatalogForDocument("ws-a", "doc-a", store);

    expect(removed).toBe(1);
    expect(await store.findByDocument("ws-a", "doc-a")).toHaveLength(0);
    expect(await store.findByDocument("ws-a", "doc-b")).toHaveLength(1);
  });

  it("workspace A catalog entity is not visible in workspace B resolveGraphEntity", async () => {
    const store = createCatalogStore([
      {
        id: "cat-a",
        workspaceId: "ws-a",
        normalizedName: "project atlas",
        entityType: "product",
        displayName: "Project Atlas",
        neo4jNodeId: "entity:ws-a:project atlas:product",
        sourceDocumentId: "doc-a",
      },
    ]);
    setEntityCatalogStoreForTests(store);

    const hitA = await resolveGraphEntity("Tell me about Project Atlas", "ws-a");
    const hitB = await resolveGraphEntity("Tell me about Project Atlas", "ws-b");

    expect(hitA).toMatchObject({ source: "catalog", displayName: "Project Atlas" });
    expect(hitB).toBeNull();
  });
});
