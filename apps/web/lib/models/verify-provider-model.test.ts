import { afterEach, describe, expect, it, vi } from "vitest";

import { listProviderModelIds } from "./verify-provider-model";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listProviderModelIds", () => {
  it("asks Anthropic with x-api-key instead of a bearer token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "claude-opus-5-5" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const ids = await listProviderModelIds("https://api.anthropic.com/v1/", "sk-ant-test");

    expect(ids).toEqual(["claude-opus-5-5"]);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers.Authorization).toBeUndefined();
  });

  it("keeps bearer auth for other platforms", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "openai/gpt-oss-120b" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await listProviderModelIds("https://api.groq.com/openai/v1", "gsk-test");

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer gsk-test");
  });
});
