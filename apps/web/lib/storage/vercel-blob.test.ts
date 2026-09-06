import { describe, expect, it } from "vitest";

import { isTrustedVercelBlobUrl } from "./vercel-blob";

describe("isTrustedVercelBlobUrl", () => {
  it("accepts vercel blob hosts over https", () => {
    expect(isTrustedVercelBlobUrl("https://blob.vercel-storage.com/uploads/a.pdf")).toBe(true);
    expect(
      isTrustedVercelBlobUrl("https://storeid.public.blob.vercel-storage.com/uploads/a.pdf"),
    ).toBe(true);
    expect(
      isTrustedVercelBlobUrl("https://storeid.private.blob.vercel-storage.com/uploads/a.pdf"),
    ).toBe(true);
  });

  it("rejects non-blob or insecure urls", () => {
    expect(isTrustedVercelBlobUrl("http://blob.vercel-storage.com/x")).toBe(false);
    expect(isTrustedVercelBlobUrl("https://evil.com/blob.vercel-storage.com/x")).toBe(false);
    expect(isTrustedVercelBlobUrl("not-a-url")).toBe(false);
  });
});
