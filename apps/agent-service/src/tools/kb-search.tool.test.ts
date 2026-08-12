/**
 * kb_search 单测：强制 workspaceId、经 VectorStore（无 Astra 直连）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchMock = vi.fn();
const embedTextMock = vi.fn();

vi.mock("@personal-gpt/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@personal-gpt/shared")>();
  return {
    ...actual,
    embedText: (...args: unknown[]) => embedTextMock(...args),
    createVectorStore: () => ({
      search: searchMock,
      upsert: vi.fn(),
      deleteByDocument: vi.fn(),
    }),
  };
});

describe("kb_search tool", () => {
  beforeEach(() => {
    searchMock.mockReset();
    embedTextMock.mockReset();
    embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
    searchMock.mockResolvedValue([
      {
        text: "报销需提交发票原件",
        similarity: 0.91,
        title: "差旅政策",
        source: "policy.md",
        documentId: "doc-1",
        chunkIndex: 0,
      },
    ]);
  });

  it("always passes workspaceId to VectorStore.search (defaults when omitted)", async () => {
    const { kbSearchTool, invokeKbSearch } = await import("./kb-search.tool");
    expect(kbSearchTool.name).toBe("kb_search");

    const out = await invokeKbSearch({ query: "差旅报销" });
    expect(embedTextMock).toHaveBeenCalledWith("差旅报销");
    expect(searchMock).toHaveBeenCalled();
    const params = searchMock.mock.calls[0]![0] as { workspaceId: string; limit?: number };
    expect(params.workspaceId).toBeTruthy();
    expect(typeof params.workspaceId).toBe("string");
    expect(out).toMatch(/差旅政策|报销|知识库/);
    expect(out).toMatch(/doc-1|citation|来源|source/i);
  });

  it("forwards explicit workspaceId and topK", async () => {
    const { invokeKbSearch } = await import("./kb-search.tool");
    await invokeKbSearch({
      query: "政策",
      workspaceId: "ws-custom",
      topK: 3,
    });
    const params = searchMock.mock.calls[0]![0] as {
      workspaceId: string;
      limit?: number;
    };
    expect(params.workspaceId).toBe("ws-custom");
    expect(params.limit).toBe(3);
  });

  it("does not import @datastax/astra-db-ts in kb-search source path", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(__dirname, "kb-search.tool.ts"),
      "utf8",
    );
    const retrieveSrc = await fs.readFile(
      path.join(__dirname, "../rag/retrieve.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/@datastax\/astra-db-ts/);
    expect(retrieveSrc).not.toMatch(/@datastax\/astra-db-ts/);
    expect(retrieveSrc).toMatch(/createVectorStore|VectorStore/);
  });
});
