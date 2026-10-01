import { describe, expect, it, vi } from "vitest";

import { assertRemoteUploadWithinLimits } from "./remote-upload-assert";

const ALLOWED = ["application/pdf", "text/plain"] as const;

describe("assertRemoteUploadWithinLimits", () => {
  it("rejects when Content-Length exceeds maxBytes", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: { "content-length": "999999999", "content-type": "application/pdf" },
        }),
    );
    const result = await assertRemoteUploadWithinLimits({
      url: "https://abc.blob.vercel-storage.com/x.pdf",
      maxBytes: 1000,
      allowedMimeTypes: ALLOWED,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, code: "file_too_large" });
  });

  it("rejects disallowed Content-Type", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: { "content-length": "100", "content-type": "image/png" },
        }),
    );
    const result = await assertRemoteUploadWithinLimits({
      url: "https://abc.blob.vercel-storage.com/x.png",
      maxBytes: 1000,
      allowedMimeTypes: ALLOWED,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, code: "mime_not_allowed" });
  });

  it("accepts allowed pdf within limit", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: { "content-length": "500", "content-type": "application/pdf" },
        }),
    );
    await expect(
      assertRemoteUploadWithinLimits({
        url: "https://abc.blob.vercel-storage.com/x.pdf",
        maxBytes: 1000,
        allowedMimeTypes: ALLOWED,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ ok: true });
  });
});
