import { Writable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { AgentController } from "../../apps/agent-service/src/agent/agent.controller";

class MockConfigService {
  constructor(private readonly values: Record<string, string>) {}

  get<T>(key: string): T | undefined {
    return this.values[key] as T | undefined;
  }
}

class CollectingResponse extends Writable {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = "";

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }

  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.body += chunk.toString();
    callback();
  }
}

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  let index = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });

  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    }),
    text: async () => chunks.join(""),
    body,
  } as unknown as Response;
}

describe("AgentController POST /agent/chat (ENG-03)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  it("proxies SSE from WEB_URL config to Express response", async () => {
    const controller = new AgentController(
      new MockConfigService({
        WEB_URL: "http://web.test:4000",
        INTERNAL_PROXY_KEY: "test-proxy-key",
      }) as never,
    );

    fetchMock.mockResolvedValue(
      sseResponse(['data: {"type":"text-delta","text":"hi"}\n\n', "data: [DONE]\n\n"]),
    );

    const res = new CollectingResponse();
    const req = { headers: { "x-evil-host": "https://attacker.example" } } as Request;

    await controller.chat(req, res as unknown as Response, {
      messages: [{ role: "user", content: "hello" }],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://web.test:4000/api/chat");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Internal-Proxy-Key": "test-proxy-key",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(url).not.toContain("attacker");

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    expect(res.headers["Cache-Control"]).toBe("no-cache");
    expect(res.body).toContain("text-delta");
    expect(res.body).toContain("[DONE]");
  });

  it("defaults WEB_URL to localhost:3000 when unset", async () => {
    const controller = new AgentController(new MockConfigService({}) as never);

    fetchMock.mockResolvedValue(sseResponse(["data: ok\n\n"]));

    const res = new CollectingResponse();
    await controller.chat({ headers: {} } as Request, res as unknown as Response, {});

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3000/api/chat");
  });
});
