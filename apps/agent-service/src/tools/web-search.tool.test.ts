/**
 * web_search 单测：无 key / 上游失败 → 可读降级，不 throw（D-14/D-16）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("web_search tool", () => {
  const prevKey = process.env.BOCHA_API_KEY;
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  beforeEach(() => {
    fetchSpy.mockReset();
    delete process.env.BOCHA_API_KEY;
  });

  afterEach(() => {
    if (prevKey === undefined) {
      delete process.env.BOCHA_API_KEY;
    } else {
      process.env.BOCHA_API_KEY = prevKey;
    }
  });

  it("returns degrade string when BOCHA_API_KEY is missing (no throw)", async () => {
    const { webSearchTool, invokeWebSearch } = await import("./web-search.tool");
    expect(webSearchTool.name).toBe("web_search");

    const out = await invokeWebSearch({ query: "LangGraph 对比" });
    expect(typeof out).toBe("string");
    expect(out).toMatch(/不可用|降级|未配置|BOCHA/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns degrade string when upstream fetch fails (no throw)", async () => {
    process.env.BOCHA_API_KEY = "test-key";
    fetchSpy.mockRejectedValue(new Error("network down"));

    const { invokeWebSearch } = await import("./web-search.tool");
    const out = await invokeWebSearch({ query: "竞品调研" });
    expect(out).toMatch(/不可用|降级|失败|错误/i);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("returns degrade string on non-OK HTTP without throwing", async () => {
    process.env.BOCHA_API_KEY = "test-key";
    fetchSpy.mockResolvedValue(
      new Response("upstream boom", { status: 502, statusText: "Bad Gateway" }),
    );

    const { invokeWebSearch } = await import("./web-search.tool");
    const out = await invokeWebSearch({ query: "市场报告" });
    expect(out).toMatch(/失败|不可用|降级|502/i);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("does not accept arbitrary user URLs (SSRF guard — only Bocha endpoint)", async () => {
    process.env.BOCHA_API_KEY = "test-key";
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ code: 200, data: { webPages: { value: [] } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { invokeWebSearch } = await import("./web-search.tool");
    await invokeWebSearch({ query: "https://evil.example/ssrf" });
    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(new URL(url).hostname).toBe("api.bochaai.com");
  });

  it("isolates quota by threadId and enforces per-thread cap", async () => {
    process.env.BOCHA_API_KEY = "test-key";
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ code: 200, data: { webPages: { value: [] } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const {
      invokeWebSearch,
      resetWebSearchCallCount,
      getWebSearchCallCount,
      MAX_WEB_SEARCH_CALLS_PER_TASK,
    } = await import("./web-search.tool");

    resetWebSearchCallCount("t-a");
    resetWebSearchCallCount("t-b");

    for (let i = 0; i < MAX_WEB_SEARCH_CALLS_PER_TASK; i++) {
      await invokeWebSearch({ query: `a-${i}`, threadId: "t-a" });
    }
    const fetchCountBeforeCap = fetchSpy.mock.calls.length;
    const capped = await invokeWebSearch({ query: "a-over", threadId: "t-a" });
    expect(capped).toMatch(/上限/);
    expect(getWebSearchCallCount("t-a")).toBe(MAX_WEB_SEARCH_CALLS_PER_TASK + 1);
    expect(fetchSpy.mock.calls.length).toBe(fetchCountBeforeCap);

    const other = await invokeWebSearch({ query: "b-1", threadId: "t-b" });
    expect(other).not.toMatch(/上限/);
    expect(getWebSearchCallCount("t-b")).toBe(1);
  });

  it("parses web sources and formats markdown references", async () => {
    const { parseWebSearchSources, formatWebReferencesMarkdown } =
      await import("./web-search.tool");
    const text = `引用: 1
标题: LangGraph Docs
URL: https://langchain-ai.github.io/langgraph/
摘要: x

引用: 2
标题: AutoGen
URL: https://microsoft.github.io/autogen/
摘要: y`;
    const sources = parseWebSearchSources(text);
    expect(sources).toEqual([
      { title: "LangGraph Docs", url: "https://langchain-ai.github.io/langgraph/" },
      { title: "AutoGen", url: "https://microsoft.github.io/autogen/" },
    ]);
    const md = formatWebReferencesMarkdown(sources);
    expect(md).toContain("## 参考来源");
    expect(md).toContain("[LangGraph Docs](https://langchain-ai.github.io/langgraph/)");
  });
});
