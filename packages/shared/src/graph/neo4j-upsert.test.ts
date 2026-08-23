import neo4j, { type Driver } from "neo4j-driver";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ExtractedEntity, ExtractedRelation } from "./extract-entities";
import { resetNeo4jGraphConstraintsForTests } from "./neo4j-constraints";
import { stableEntityId, upsertDocumentGraph } from "./neo4j-upsert";

function createMockDriver() {
  const mockRun = vi.fn().mockResolvedValue({ records: [] });
  const mockTx = { run: mockRun };
  const mockExecuteWrite = vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockSession = {
    executeWrite: mockExecuteWrite,
    close: mockClose,
  };
  const mockDriver = {
    session: vi.fn(() => mockSession),
  };
  return { mockDriver, mockRun, mockExecuteWrite, mockSession, mockClose };
}

describe("stableEntityId", () => {
  it("derives deterministic id from workspace + normalized key", () => {
    expect(stableEntityId("ws-1", "alice", "person")).toBe("entity:ws-1:alice:person");
  });
});

describe("upsertDocumentGraph", () => {
  beforeEach(() => {
    resetNeo4jGraphConstraintsForTests();
  });

  it("uses WRITE session and MERGEs Document with workspaceId", async () => {
    const { mockDriver, mockRun, mockSession } = createMockDriver();
    const entities: ExtractedEntity[] = [
      { name: "Alice", normalizedName: "alice", entityType: "person" },
    ];
    const relations: ExtractedRelation[] = [];

    await upsertDocumentGraph(
      { workspaceId: "ws-1", documentId: "doc-1", entities, relations },
      mockDriver as unknown as Driver,
    );

    expect(mockDriver.session).toHaveBeenCalledWith({ defaultAccessMode: neo4j.session.WRITE });
    expect(mockRun).toHaveBeenCalled();
    const firstCall = mockRun.mock.calls[0];
    expect(firstCall?.[0]).toMatch(/MERGE \(d:Document \{id: \$documentId\}\)/);
    expect(firstCall?.[1]).toEqual({
      documentId: "doc-1",
      workspaceId: "ws-1",
    });
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("MERGEs Entity nodes with composite key and MENTIONS from Document", async () => {
    const { mockDriver, mockRun } = createMockDriver();
    const entities: ExtractedEntity[] = [
      { name: "Alice", normalizedName: "alice", entityType: "person" },
      { name: "Acme", normalizedName: "acme", entityType: "org" },
    ];

    await upsertDocumentGraph(
      {
        workspaceId: "ws-1",
        documentId: "doc-1",
        entities,
        relations: [
          {
            fromName: "Alice",
            toName: "Acme",
            fromNormalizedName: "alice",
            toNormalizedName: "acme",
            type: "RELATED_TO",
          },
        ],
      },
      mockDriver as unknown as Driver,
    );

    const entityMergeCall = mockRun.mock.calls.find((call) =>
      String(call[0]).includes("UNWIND $entities AS ent"),
    );
    expect(entityMergeCall?.[1]?.entities).toEqual([
      {
        name: "Alice",
        normalizedName: "alice",
        entityType: "person",
        id: "entity:ws-1:alice:person",
        workspaceId: "ws-1",
      },
      {
        name: "Acme",
        normalizedName: "acme",
        entityType: "org",
        id: "entity:ws-1:acme:org",
        workspaceId: "ws-1",
      },
    ]);

    const relatedToCall = mockRun.mock.calls.find((call) =>
      String(call[0]).includes("[:RELATED_TO]"),
    );
    expect(relatedToCall?.[1]).toMatchObject({
      workspaceId: "ws-1",
      relations: [{ fromNormalizedName: "alice", toNormalizedName: "acme" }],
    });
  });
});

describe("ensureNeo4jGraphConstraints integration via upsert helper", () => {
  it("runs constraint statements once per process", async () => {
    const { ensureNeo4jGraphConstraints } = await import("./neo4j-constraints");
    resetNeo4jGraphConstraintsForTests();
    const runs: string[] = [];
    await ensureNeo4jGraphConstraints(async (stmt) => {
      runs.push(stmt);
    });
    await ensureNeo4jGraphConstraints(async (stmt) => {
      runs.push(stmt);
    });
    expect(runs).toHaveLength(3);
  });
});
