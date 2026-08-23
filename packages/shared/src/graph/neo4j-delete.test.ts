import neo4j, { type Driver } from "neo4j-driver";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteGraphForDocument } from "./neo4j-delete";

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

describe("deleteGraphForDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses WRITE session scoped by workspaceId and documentId", async () => {
    const { mockDriver, mockRun } = createMockDriver();

    await deleteGraphForDocument("ws-1", "doc-1", mockDriver as unknown as Driver);

    expect(mockDriver.session).toHaveBeenCalledWith({ defaultAccessMode: neo4j.session.WRITE });
    expect(mockRun).toHaveBeenCalled();
    const cypher = String(mockRun.mock.calls[0]?.[0]);
    expect(cypher).toMatch(/Document \{id: \$documentId, workspaceId: \$workspaceId\}/);
    expect(cypher).toMatch(/DETACH DELETE d/);
    expect(mockRun.mock.calls[0]?.[1]).toEqual({
      documentId: "doc-1",
      workspaceId: "ws-1",
    });
  });

  it("removes orphan Entity nodes with no remaining MENTIONS", async () => {
    const { mockDriver, mockRun } = createMockDriver();

    await deleteGraphForDocument("ws-1", "doc-1", mockDriver as unknown as Driver);

    const cypher = String(mockRun.mock.calls[0]?.[0]);
    expect(cypher).toMatch(/MENTIONS/);
    expect(cypher).toMatch(/DETACH DELETE e/);
    expect(cypher).toMatch(/refs = 0/);
  });

  it("does not target seed nodes without user Document scope", async () => {
    const { mockDriver, mockRun } = createMockDriver();

    await deleteGraphForDocument("ws-1", "doc-1", mockDriver as unknown as Driver);

    const cypher = String(mockRun.mock.calls[0]?.[0]);
    expect(cypher).not.toMatch(/MATCH \(e:Entity\)\s+DETACH DELETE e/);
    expect(cypher).toMatch(/Document \{id: \$documentId, workspaceId: \$workspaceId\}/);
  });
});
