import { afterEach, describe, expect, it } from "vitest";

import { parseCorsOrigins } from "./cors-origins";

describe("parseCorsOrigins", () => {
  const prevEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
  });

  it("returns single origin or list", () => {
    process.env.NODE_ENV = "development";
    expect(parseCorsOrigins("http://localhost:3000")).toBe("http://localhost:3000");
    expect(parseCorsOrigins("http://a.com, http://b.com")).toEqual([
      "http://a.com",
      "http://b.com",
    ]);
  });

  it("rejects wildcard alone or in a list when credentials remain enabled", () => {
    process.env.NODE_ENV = "development";
    expect(() => parseCorsOrigins("*")).toThrow(/wildcard/i);
    expect(() => parseCorsOrigins("http://localhost:3000, *")).toThrow(/wildcard/i);
  });

  it("throws in production when CORS_ORIGIN unset (no localhost fallback)", () => {
    process.env.NODE_ENV = "production";
    expect(() => parseCorsOrigins(undefined)).toThrow(/CORS_ORIGIN must be set in production/i);
  });

  it("keeps localhost fallback in non-production when unset", () => {
    process.env.NODE_ENV = "development";
    expect(parseCorsOrigins(undefined)).toBe("http://localhost:3000");
  });
});
