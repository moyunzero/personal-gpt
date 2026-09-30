import { describe, expect, it } from "vitest";

import { isOriginAllowed } from "./origin-allowlist";

const ALLOWED = new Set([
  "http://localhost:3000",
  "https://moyunzero.github.io",
]);

describe("isOriginAllowed", () => {
  it("accepts whitelisted Origin", () => {
    const headers = new Headers({ origin: "https://moyunzero.github.io" });
    expect(isOriginAllowed(headers, ALLOWED)).toBe(true);
  });

  it("rejects Referer-only forged header (no Origin)", () => {
    const headers = new Headers({ referer: "https://moyunzero.github.io/portfolio/" });
    expect(isOriginAllowed(headers, ALLOWED)).toBe(false);
  });

  it("rejects missing Origin and Referer", () => {
    expect(isOriginAllowed(new Headers(), ALLOWED)).toBe(false);
  });

  it("rejects Origin not on whitelist even if Referer matches", () => {
    const headers = new Headers({
      origin: "https://evil.example",
      referer: "https://moyunzero.github.io/",
    });
    expect(isOriginAllowed(headers, ALLOWED)).toBe(false);
  });
});
