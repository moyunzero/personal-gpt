/**
 * kb_search 单测：经 retrieveKb → shared hybridSearch（无 Astra 直连）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { hybridSearchMock } = vi.hoisted(() => ({
  hybridSearchMock: vi.fn(),
}));

vi.mock("@personal-gpt/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@personal-gpt/shared")>();
  return {
    ...actual,
    hybridSearch: (...args: unknown[]) => hybridSearchMock(...args),
  };
});

describe("kb_search tool", () => {
  const prevMinSim = process.env.AGENT_KB_MIN_SIMILARITY;

  beforeEach(() => {
    delete process.env.AGENT_KB_MIN_SIMILARITY;
    hybridSearchMock.mockReset();
    hybridSearchMock.mockResolvedValue([
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

  afterEach(() => {
    if (prevMinSim === undefined) delete process.env.AGENT_KB_MIN_SIMILARITY;
    else process.env.AGENT_KB_MIN_SIMILARITY = prevMinSim;
  });

  it("always passes workspaceId to hybridSearch (defaults when omitted)", async () => {
    const { kbSearchTool, invokeKbSearch } = await import("./kb-search.tool");
    expect(kbSearchTool.name).toBe("kb_search");

    const out = await invokeKbSearch({ query: "差旅报销" });
    expect(hybridSearchMock).toHaveBeenCalled();
    const params = hybridSearchMock.mock.calls[0]![0] as {
      workspaceId: string;
      query: string;
      corpus?: string;
    };
    expect(params.workspaceId).toBeTruthy();
    expect(typeof params.workspaceId).toBe("string");
    expect(params.query).toBe("差旅报销");
    expect(params.corpus ?? "user").toBe("user");
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
    const params = hybridSearchMock.mock.calls[0]![0] as {
      workspaceId: string;
      limit?: number;
    };
    expect(params.workspaceId).toBe("ws-custom");
    expect(params.limit).toBe(3);
  });

  it("filters low-similarity chunks and returns NO_RELEVANT_HIT", async () => {
    hybridSearchMock.mockResolvedValueOnce([
      {
        text: "无关心理问答",
        similarity: 0.58,
        title: "psychology-qa",
        source: "seed",
        documentId: "psy-1",
        chunkIndex: 0,
      },
    ]);
    const { invokeKbSearch, KB_SEARCH_NO_HIT_STATUS } = await import("./kb-search.tool");
    const out = await invokeKbSearch({ query: "LangGraph vs AutoGen" });
    expect(out).toContain(KB_SEARCH_NO_HIT_STATUS);
    expect(out).toMatch(/禁止编造/);
    expect(out).not.toMatch(/\[citation/);
  });

  it("keeps high-similarity hits with HIT status", async () => {
    const { invokeKbSearch } = await import("./kb-search.tool");
    const out = await invokeKbSearch({ query: "差旅报销" });
    expect(out).toContain("KB_SEARCH_STATUS: HIT");
    expect(out).toMatch(/doc-1/);
  });

  it("falls back to userText when rewritten query misses", async () => {
    hybridSearchMock
      .mockResolvedValueOnce([
        {
          text: "无关",
          similarity: 0.4,
          title: "noise",
          source: "x",
          documentId: "n1",
          chunkIndex: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          text: "蓝莓河豚协议 ZX-7749 生效条件",
          similarity: 0.88,
          title: "蓝莓河豚协议",
          source: "protocol.md",
          documentId: "phase2-kb-hit-zx7749",
          chunkIndex: 0,
        },
      ]);
    const { invokeKbSearch } = await import("./kb-search.tool");
    const out = await invokeKbSearch({
      query: "生效条件",
      userText: "请检索蓝莓河豚协议 ZX-7749 的生效条件",
    });
    expect(hybridSearchMock).toHaveBeenCalledTimes(2);
    expect(hybridSearchMock.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ query: "生效条件" }),
    );
    expect(hybridSearchMock.mock.calls[1]![0]).toEqual(
      expect.objectContaining({ query: "请检索蓝莓河豚协议 ZX-7749 的生效条件" }),
    );
    expect(out).toContain("KB_SEARCH_STATUS: HIT");
    expect(out).toContain("phase2-kb-hit-zx7749");
    expect(out).toMatch(/用户原话回退/);
  });

  it("falls back to condensed query when long task prompt misses", async () => {
    hybridSearchMock
      .mockResolvedValueOnce([
        {
          text: "noise",
          similarity: 0.5,
          title: "n",
          source: "n",
          documentId: "n1",
          chunkIndex: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          text: "韶音产品使用说明",
          similarity: 0.72,
          title: "韶音手册2024",
          source: "shaoyin.pdf",
          documentId: "doc-shaoyin",
          chunkIndex: 0,
        },
      ]);
    const { invokeKbSearch } = await import("./kb-search.tool");
    const long = "先查知识库里关于韶音手册的资料，再整理成一份简短 Markdown 报告";
    const out = await invokeKbSearch({ query: long, userText: long });
    expect(hybridSearchMock).toHaveBeenCalledTimes(2);
    expect((hybridSearchMock.mock.calls[1]![0] as { query: string }).query).toMatch(/韶音手册/);
    expect(out).toContain("KB_SEARCH_STATUS: HIT");
    expect(out).toContain("doc-shaoyin");
    expect(out).toMatch(/压缩检索词/);
  });

  it("treats similarity 0.65 as hit under default 0.60 threshold", async () => {
    hybridSearchMock.mockResolvedValueOnce([
      {
        text: "近阈值命中",
        similarity: 0.65,
        title: "韶音手册2024",
        source: "s.pdf",
        documentId: "near",
        chunkIndex: 0,
      },
    ]);
    const { invokeKbSearch } = await import("./kb-search.tool");
    const out = await invokeKbSearch({ query: "韶音手册" });
    expect(out).toContain("KB_SEARCH_STATUS: HIT");
    expect(out).toContain("near");
  });

  it("allows ≥2 kb_search / retrieveKb calls under recursion limit via shared hybrid (RAG-05)", async () => {
    const { getAgentRunConfig } = await import("../graph/build-graph");
    const { invokeKbSearch } = await import("./kb-search.tool");

    const recursionLimit = getAgentRunConfig("rag-05-thread").recursionLimit;
    expect(recursionLimit).toBeGreaterThanOrEqual(2);

    hybridSearchMock
      .mockResolvedValueOnce([
        {
          text: "hop1",
          similarity: 0.9,
          title: "doc-a",
          documentId: "a",
          chunkIndex: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          text: "hop2",
          similarity: 0.91,
          title: "doc-b",
          documentId: "b",
          chunkIndex: 0,
        },
      ]);

    const out1 = await invokeKbSearch({ query: "子查询一 专有名词A" });
    const out2 = await invokeKbSearch({ query: "子查询二 专有名词B" });

    expect(hybridSearchMock).toHaveBeenCalledTimes(2);
    expect(hybridSearchMock.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ query: "子查询一 专有名词A", corpus: "user" }),
    );
    expect(hybridSearchMock.mock.calls[1]![0]).toEqual(
      expect.objectContaining({ query: "子查询二 专有名词B", corpus: "user" }),
    );
    expect(out1).toContain("KB_SEARCH_STATUS: HIT");
    expect(out2).toContain("KB_SEARCH_STATUS: HIT");
    // Distinct subqueries fit comfortably under configured recursion limit (D-35)
    expect(2).toBeLessThanOrEqual(recursionLimit);
  });

  it("does not import @datastax/astra-db-ts; retrieve uses hybridSearch", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(path.join(__dirname, "kb-search.tool.ts"), "utf8");
    const retrieveSrc = await fs.readFile(path.join(__dirname, "../rag/retrieve.ts"), "utf8");
    expect(src).not.toMatch(/@datastax\/astra-db-ts/);
    expect(retrieveSrc).not.toMatch(/@datastax\/astra-db-ts/);
    expect(retrieveSrc).toMatch(/hybridSearch/);
  });
});
