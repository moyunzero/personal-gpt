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
  });

  it("returns degrade string on non-OK HTTP without throwing", async () => {
    process.env.BOCHA_API_KEY = "test-key";
    fetchSpy.mockResolvedValue(
      new Response("upstream boom", { status: 502, statusText: "Bad Gateway" }),
    );

    const { invokeWebSearch } = await import("./web-search.tool");
    const out = await invokeWebSearch({ query: "市场报告" });
    expect(out).toMatch(/失败|不可用|降级|502/i);
  });

  it("does not accept arbitrary user URLs (SSRF guard — only Bocha endpoint)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(__dirname, "web-search.tool.ts"),
      "utf8",
    );
    expect(src).toMatch(/api\.bochaai\.com/);
    expect(src).not.toMatch(/input\.url|userUrl|fetch\(query\)/);
  });
});
