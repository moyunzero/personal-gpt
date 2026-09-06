import { beforeEach, describe, expect, it, vi } from "vitest";

import { graphRagQuery, resolveGraphEntity, type ResolvedGraphEntity } from "@personal-gpt/shared";
import { retrieveKb } from "../../../apps/agent-service/src/rag/retrieve";
import { invokeGraphSearch } from "../../../apps/agent-service/src/tools/graph-search.tool";

const WORKSPACE = "ws-agent-acl";
const DOC_PRIVATE_A = "doc-private-a";
const DOC_WORKSPACE = "doc-workspace-shared";

const catalogEntity: ResolvedGraphEntity = {
  source: "catalog",
  displayName: "Project Atlas",
  normalizedName: "project atlas",
  entityType: "concept",
  neo4jNodeId: "entity:atlas",
};

const { hybridSearchMock } = vi.hoisted(() => ({
  hybridSearchMock: vi.fn(),
}));

vi.mock("@personal-gpt/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@personal-gpt/shared")>();
  return {
    ...actual,
    hybridSearch: (...args: unknown[]) => hybridSearchMock(...args),
    graphRagQuery: vi.fn(actual.graphRagQuery),
    resolveGraphEntity: vi.fn(actual.resolveGraphEntity),
  };
});

describe("Phase 4 regression #5: agent-path ACL isolation (PROD-03)", () => {
  beforeEach(() => {
    hybridSearchMock.mockReset();
    hybridSearchMock.mockResolvedValue([]);
    vi.mocked(graphRagQuery).mockReset();
    vi.mocked(resolveGraphEntity).mockReset();
  });

  it("retrieveKb passes documentIds to hybridSearch", async () => {
    hybridSearchMock.mockResolvedValueOnce([
      {
        text: "shared",
        similarity: 0.9,
        documentId: DOC_WORKSPACE,
        chunkIndex: 0,
      },
    ]);

    await retrieveKb({
      query: "test",
      workspaceId: WORKSPACE,
      documentIds: [DOC_WORKSPACE],
    });

    expect(hybridSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE,
        documentIds: [DOC_WORKSPACE],
      }),
      {},
    );
  });

  it("invokeGraphSearch passes documentIds to graphRagQuery and resolveGraphEntity", async () => {
    vi.mocked(resolveGraphEntity).mockResolvedValue(catalogEntity);
    vi.mocked(graphRagQuery).mockResolvedValue({
      summary: "GRAPH_RAG_STATUS: HIT",
      paths: [
        {
          nodes: [
            {
              id: "n1",
              labels: ["Entity"],
              properties: { name: "Atlas", documentId: DOC_WORKSPACE },
            },
          ],
          relationships: [],
        },
      ],
    });

    const out = await invokeGraphSearch({
      question: "Project Atlas roadmap",
      workspaceId: WORKSPACE,
      documentIds: [DOC_WORKSPACE],
    });

    expect(resolveGraphEntity).toHaveBeenCalledWith(
      "Project Atlas roadmap",
      WORKSPACE,
      expect.objectContaining({ allowedDocumentIds: [DOC_WORKSPACE] }),
    );
    expect(graphRagQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE,
        documentIds: [DOC_WORKSPACE],
        resolvedEntity: catalogEntity,
      }),
    );
    expect(out).toMatch(/GRAPH_SEARCH_STATUS:\s*HIT/);
  });

  it("resolveGraphEntity receives allowedDocumentIds when documentIds set on graph search", async () => {
    vi.mocked(resolveGraphEntity).mockResolvedValue(null);
    vi.mocked(graphRagQuery).mockResolvedValue({
      summary: "GRAPH_RAG_STATUS: NO_PATH",
      paths: [],
    });

    await invokeGraphSearch({
      question: "Secret Project",
      workspaceId: WORKSPACE,
      documentIds: [DOC_PRIVATE_A],
    });

    expect(resolveGraphEntity).toHaveBeenCalledWith(
      "Secret Project",
      WORKSPACE,
      expect.objectContaining({ allowedDocumentIds: [DOC_PRIVATE_A] }),
    );
  });
});
