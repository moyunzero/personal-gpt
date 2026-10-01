import { describe, expect, it, beforeEach } from "vitest";

import {
  assertChunksPayload,
  assertInternalVectorContentLength,
  assertNoCustomCollectionName,
  checkInternalProxyRateLimit,
  isUuid,
  resetInternalProxyRateLimitForTests,
} from "./internal-vector-guard";

describe("internal-vector-guard", () => {
  beforeEach(() => {
    resetInternalProxyRateLimitForTests();
  });

  it("rejects oversized Content-Length", () => {
    const req = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-length": "2000000" },
    });
    expect(assertInternalVectorContentLength(req)).toMatchObject({
      ok: false,
      status: 413,
    });
  });

  it("rejects custom collectionName", () => {
    expect(assertNoCustomCollectionName("evil")).toMatchObject({ ok: false });
    expect(assertNoCustomCollectionName(undefined)).toEqual({ ok: true });
  });

  it("rejects too many chunks", () => {
    const chunks = Array.from({ length: 201 }, () => ({ text: "x" }));
    expect(assertChunksPayload(chunks)).toMatchObject({
      ok: false,
      error: "chunks_limit_exceeded",
    });
  });

  it("validates uuid", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("rate limits after burst", () => {
    for (let i = 0; i < 60; i++) {
      expect(checkInternalProxyRateLimit("k", 60).ok).toBe(true);
    }
    expect(checkInternalProxyRateLimit("k", 60)).toMatchObject({
      ok: false,
      status: 429,
    });
  });
});
