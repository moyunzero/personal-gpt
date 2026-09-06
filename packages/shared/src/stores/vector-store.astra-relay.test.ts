import { afterEach, describe, expect, it, vi } from "vitest";

import { createAstraRelayVectorStore, isAstraRelayConfigured } from "./vector-store.astra-relay";

describe("Astra relay VectorStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VECTOR_ASTRA_RELAY_URL;
    delete process.env.INTERNAL_PROXY_KEY;
  });

  it("isAstraRelayConfigured requires both URL and key", () => {
    expect(isAstraRelayConfigured({})).toBe(false);
    expect(isAstraRelayConfigured({ VECTOR_ASTRA_RELAY_URL: "https://x.example" })).toBe(false);
    expect(
      isAstraRelayConfigured({
        VECTOR_ASTRA_RELAY_URL: "https://x.example",
        INTERNAL_PROXY_KEY: "secret",
      }),
    ).toBe(true);
  });

  it("upsert posts chunks to relay with internal key", async () => {
    process.env.VECTOR_ASTRA_RELAY_URL = "https://relay.example/";
    process.env.INTERNAL_PROXY_KEY = "k";
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const store = createAstraRelayVectorStore({ corpus: "user" });
    await store.upsert([
      {
        workspaceId: "ws-1",
        documentId: "doc-1",
        chunkIndex: 0,
        text: "hi",
        vector: [0.1, 0.2],
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://relay.example/api/internal/vector/upsert");
    expect((init as RequestInit).headers).toMatchObject({
      "x-internal-proxy-key": "k",
    });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.chunks).toHaveLength(1);
    expect(body.corpus).toBe("user");
  });

  it("throws when relay returns non-2xx", async () => {
    process.env.VECTOR_ASTRA_RELAY_URL = "https://relay.example";
    process.env.INTERNAL_PROXY_KEY = "k";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 403 })),
    );

    const store = createAstraRelayVectorStore();
    await expect(store.deleteByDocument("ws-1", "doc-1")).rejects.toThrow(
      /Astra relay .*failed \(403\)/,
    );
  });
});
