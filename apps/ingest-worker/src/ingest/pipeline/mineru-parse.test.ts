import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PDF_NO_SELECTABLE_TEXT } from "./parse";
import { toChunkRecords } from "./split";
import { PDF_PARSE_FAILED, parseWithMinerU, resolvePdfChunks } from "./mineru-parse";

const TOKEN = "secret-token";
const BLOB = "https://store.blob.vercel-storage.com/private/scan.pdf";

type Call = { url: string; init?: RequestInit };

function zipWith(name: string, content: string): Buffer {
  const data = Buffer.from(content);
  const compressed = deflateRawSync(data);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt16LE(nameBuf.length, 26);
  return Buffer.concat([local, nameBuf, compressed]);
}

function authorization(init?: RequestInit): string | undefined {
  const headers = init?.headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get("authorization") ?? undefined;
  if (Array.isArray(headers)) return undefined;
  const record = headers as Record<string, string>;
  return record.Authorization ?? record.authorization;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function scriptedFetch(
  calls: Call[],
  options?: {
    applyCode?: number;
    polls?: Array<"running" | "failed" | "done" | "blank" | "missing">;
    markdown?: string;
    throwMessage?: string;
  },
): typeof fetch {
  const polls = options?.polls ?? ["done"];
  const markdown = options?.markdown ?? "# 第二章\n表格还在";
  let pollIndex = 0;
  return (async (url: string | URL | Request, init?: RequestInit) => {
    if (options?.throwMessage) throw new Error(options.throwMessage);
    const href = String(url);
    calls.push({ url: href, init });
    if (href.endsWith("/file-urls/batch")) {
      const code = options?.applyCode ?? 0;
      return jsonResponse({
        code,
        trace_id: "trace-should-stay-hidden",
        data: code === 0 ? { batch_id: "b1", file_urls: ["https://upload.example/put"] } : {},
      });
    }
    if (href === "https://upload.example/put") {
      return new Response(null, { status: 200 });
    }
    if (href.includes("/extract-results/batch/b1")) {
      const state = polls[Math.min(pollIndex, polls.length - 1)];
      pollIndex += 1;
      if (state === "missing") return jsonResponse({ code: 0, data: {} });
      if (state === "running") {
        return jsonResponse({ code: 0, data: { extract_result: [{ state: "running" }] } });
      }
      if (state === "failed") {
        return jsonResponse({
          code: 0,
          trace_id: "trace-should-stay-hidden",
          data: { extract_result: [{ state: "failed", err_msg: "trace_id=nope" }] },
        });
      }
      return jsonResponse({
        code: 0,
        data: { extract_result: [{ state: "done", full_zip_url: "https://cdn.example/out.zip" }] },
      });
    }
    if (href === "https://cdn.example/out.zip") {
      const text = polls.includes("blank") ? " \n\t " : markdown;
      return new Response(new Uint8Array(zipWith("out/full.md", text)));
    }
    return new Response("no", { status: 404 });
  }) as typeof fetch;
}

async function exactFailure(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    expect.fail("expected throw");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(PDF_PARSE_FAILED);
    expect((error as Error).message).not.toContain(TOKEN);
    expect((error as Error).message).not.toContain("blob.vercel-storage.com");
    expect((error as Error).message).not.toContain("trace");
  }
}

describe("parseWithMinerU", () => {
  const previous = process.env.MINERU_API_TOKEN;

  afterEach(() => {
    process.env.MINERU_API_TOKEN = previous;
    vi.useRealTimers();
  });

  it("refuses to run without a token and does not call fetch", async () => {
    delete process.env.MINERU_API_TOKEN;
    const fetchImpl = vi.fn(() => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    await exactFailure(() => parseWithMinerU(Buffer.from("x"), "a.pdf", fetchImpl));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats a blank token as missing", async () => {
    process.env.MINERU_API_TOKEN = "  ";
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await exactFailure(() => parseWithMinerU(Buffer.from("x"), "scan", fetchImpl));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uploads bytes with OCR and keeps the token off the PUT", async () => {
    process.env.MINERU_API_TOKEN = TOKEN;
    const calls: Call[] = [];
    const markdown = await parseWithMinerU(
      Buffer.from("pdf-bytes"),
      "scan",
      scriptedFetch(calls),
    );
    expect(markdown).toContain("表格还在");
    const apply = calls.find((call) => call.url.endsWith("/file-urls/batch"));
    const body = String(apply?.init?.body);
    expect(body).toContain('"is_ocr":true');
    expect(body).toContain('"model_version":"pipeline"');
    expect(body).toContain('"name":"scan.pdf"');
    expect(body).not.toContain("blob.vercel-storage.com");
    expect(authorization(apply?.init)).toBe(`Bearer ${TOKEN}`);
    const put = calls.find((call) => call.url === "https://upload.example/put");
    expect(put?.init?.method).toBe("PUT");
    expect(authorization(put?.init)).toBeUndefined();
    expect(Buffer.from(put?.init?.body as Uint8Array).equals(Buffer.from("pdf-bytes"))).toBe(true);
    const poll = calls.find((call) => call.url.includes("/extract-results/batch/b1"));
    expect(authorization(poll?.init)).toBe(`Bearer ${TOKEN}`);
    const zip = calls.find((call) => call.url === "https://cdn.example/out.zip");
    expect(authorization(zip?.init)).toBeUndefined();
    expect(markdown).not.toContain(TOKEN);
  });

  it("uses the fixed sentence when MinerU returns a non-zero code", async () => {
    process.env.MINERU_API_TOKEN = TOKEN;
    const calls: Call[] = [];
    await exactFailure(() =>
      parseWithMinerU(Buffer.from("pdf"), "a.pdf", scriptedFetch(calls, { applyCode: 1 })),
    );
    expect(calls.some((call) => call.url === "https://upload.example/put")).toBe(false);
  });

  it("uses the fixed sentence when polling fails or the markdown is blank", async () => {
    process.env.MINERU_API_TOKEN = TOKEN;
    await exactFailure(() =>
      parseWithMinerU(Buffer.from("pdf"), "a.pdf", scriptedFetch([], { polls: ["failed"] })),
    );
    await exactFailure(() =>
      parseWithMinerU(Buffer.from("pdf"), "a.pdf", scriptedFetch([], { polls: ["blank"] })),
    );
    await exactFailure(() =>
      parseWithMinerU(
        Buffer.from("pdf"),
        "a.pdf",
        scriptedFetch([], { throwMessage: `GET ${BLOB} ${TOKEN} trace_id=abc` }),
      ),
    );
  });

  it("waits at least 2 seconds between polls and stops at 5 minutes", async () => {
    vi.useFakeTimers();
    process.env.MINERU_API_TOKEN = TOKEN;
    const calls: Call[] = [];
    const pending = parseWithMinerU(
      Buffer.from("pdf"),
      "a.pdf",
      scriptedFetch(calls, { polls: ["running"] }),
    );
    const failure = exactFailure(() => pending);
    await vi.advanceTimersByTimeAsync(1_999);
    const pollsEarly = calls.filter((call) => call.url.includes("/extract-results/")).length;
    expect(pollsEarly).toBe(1);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await failure;
    const polls = calls.filter((call) => call.url.includes("/extract-results/")).length;
    expect(polls).toBeGreaterThan(1);
    expect(polls).toBeLessThanOrEqual(150);
  });
});

describe("resolvePdfChunks", () => {
  const previous = process.env.MINERU_API_TOKEN;

  afterEach(() => {
    process.env.MINERU_API_TOKEN = previous;
    vi.useRealTimers();
  });

  it("does not call fetch when local PDF text already has a body", async () => {
    process.env.MINERU_API_TOKEN = TOKEN;
    const fetchImpl = vi.fn(() => {
      throw new Error("mineru");
    }) as unknown as typeof fetch;
    const loaded = await resolvePdfChunks("/uploads/rich.pdf", {
      fetchImpl,
      readBytes: async () => {
        throw new Error("bytes");
      },
      parseLocal: async () => ({
        pages: [{ num: 3, text: "正文足够" }],
        headings: [],
      }),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(loaded.pages).toEqual([3]);
    expect(loaded.chunks.join("")).toContain("正文足够");
  });

  it("does not call fetch for errors other than empty local text", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      resolvePdfChunks("/uploads/slow.pdf", {
        fetchImpl,
        parseLocal: async () => {
          throw new Error("parsePdfPages timed out after 60000ms");
        },
      }),
    ).rejects.toThrow("parsePdfPages timed out after 60000ms");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends bytes, splits headings, and omits page when local text is empty", async () => {
    process.env.MINERU_API_TOKEN = TOKEN;
    const calls: Call[] = [];
    const table = "| 科目 | 金额 |\n| --- | --- |\n| 收入 | 10 |";
    const markdown = `# 第二章\n${table}\n\n# 附录\n说明`;
    const loaded = await resolvePdfChunks(BLOB, {
      fetchImpl: scriptedFetch(calls, { markdown }),
      readBytes: async () => Buffer.from("pdf-bytes"),
      parseLocal: async () => {
        throw new Error(PDF_NO_SELECTABLE_TEXT);
      },
    });
    const apply = String(calls.find((call) => call.url.endsWith("/file-urls/batch"))?.init?.body);
    expect(apply).toContain('"name":"scan.pdf"');
    expect(apply).not.toContain("blob.vercel-storage.com");
    const put = calls.find((call) => call.url === "https://upload.example/put");
    expect(Buffer.from(put?.init?.body as Uint8Array).equals(Buffer.from("pdf-bytes"))).toBe(true);
    expect(loaded.pages).toBeUndefined();
    expect(loaded.chunks.some((chunk) => chunk.includes("第二章") && chunk.includes("收入"))).toBe(
      true,
    );
    expect(loaded.chunks.some((chunk) => chunk.includes("附录") && !chunk.includes("收入"))).toBe(
      true,
    );
    const records = toChunkRecords(
      loaded.chunks,
      loaded.chunks.map(() => [0.1]),
      { workspaceId: "w", documentId: "d" },
    );
    expect(records.every((record) => !("metadata" in record))).toBe(true);
  });

  it("keeps a markdown table together until it passes 900 characters, then splits on rows", async () => {
    process.env.MINERU_API_TOKEN = TOKEN;
    const row = `| ${"甲".repeat(20)} | ${"乙".repeat(20)} |`;
    const lines = [row, "| --- | --- |", ...Array.from({ length: 40 }, () => row)];
    expect(lines.join("\n").length).toBeGreaterThan(900);
    const loaded = await resolvePdfChunks("/uploads/table.pdf", {
      fetchImpl: scriptedFetch([], { markdown: lines.join("\n") }),
      readBytes: async () => Buffer.from("pdf-bytes"),
      parseLocal: async () => {
        throw new Error(PDF_NO_SELECTABLE_TEXT);
      },
    });
    expect(loaded.chunks.length).toBeGreaterThan(1);
    for (const chunk of loaded.chunks) {
      expect(chunk.length).toBeLessThanOrEqual(900);
      for (const line of chunk.split("\n")) {
        if (!line) continue;
        expect(line === row || line === "| --- | --- |").toBe(true);
      }
    }
  });
});
