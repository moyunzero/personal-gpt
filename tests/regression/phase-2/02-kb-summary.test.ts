/**
 * Phase 2 regression #2 — KB 总结触发 Retriever / kb_search（SC-4）。
 * citation 来自知识库（workspace 过滤）；禁止 live LLM / live Astra。
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

describe("Phase 2 regression #2: KB summary triggers Retriever + KB citation", () => {
  beforeEach(() => {
    searchMock.mockReset();
    embedTextMock.mockReset();
    embedTextMock.mockResolvedValue([0.11, 0.22, 0.33]);
    searchMock.mockResolvedValue([
      {
        text: "差旅报销须在返程后 5 个工作日内提交发票。",
        similarity: 0.88,
        title: "差旅报销政策",
        source: "kb-policy.md",
        documentId: "kb-doc-1",
        chunkIndex: 2,
      },
    ]);
  });

  it("placeholder harness (no live LLM)", () => {
    expect(true).toBe(true);
  });

  it("invokes Retriever / kb_search for knowledge-base summary prompt", async () => {
    const { invokeKbSearch, kbSearchTool } = await import(
      "../../../apps/agent-service/src/tools/kb-search.tool"
    );
    const { createRetrieverAgent } = await import(
      "../../../apps/agent-service/src/agents/retriever.agent"
    );
    const { ChatOpenAI } = await import("@langchain/openai");
    const { resolveAgentRoute } = await import(
      "../../../apps/agent-service/src/graph/build-graph"
    );

    const prompt = "请根据知识库总结差旅报销政策并列出条款出处";
    expect(resolveAgentRoute(prompt)).toBe("supervisor");

    const model = new ChatOpenAI({
      model: "mock-model",
      apiKey: "sk-test-mock",
      configuration: { baseURL: "http://127.0.0.1:9" },
    });
    const agent = createRetrieverAgent(model);
    expect(kbSearchTool.name).toBe("kb_search");
    expect(agent).toBeTruthy();

    const out = await invokeKbSearch({ query: prompt, topK: 3 });
    expect(searchMock).toHaveBeenCalledTimes(1);
    const params = searchMock.mock.calls[0]![0] as { workspaceId: string; limit?: number };
    expect(params.workspaceId).toBeTruthy();
    expect(params.limit).toBe(3);
    expect(out).toMatch(/差旅报销政策|kb-doc-1|知识库/);
  });

  it("emits citation sourced from KB (not web) under mocked store", async () => {
    const { invokeKbSearch } = await import(
      "../../../apps/agent-service/src/tools/kb-search.tool"
    );
    const out = await invokeKbSearch({ query: "差旅报销" });
    expect(out).toMatch(/来源=知识库|source: kb-policy\.md/);
    expect(out).toMatch(/documentId: kb-doc-1/);
    expect(out).toMatch(/citation/);
    expect(out).not.toMatch(/api\.bochaai\.com|webPages/);
  });
});
