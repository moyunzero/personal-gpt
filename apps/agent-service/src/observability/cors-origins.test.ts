import { describe, expect, it } from "vitest";

import { parseCorsOrigins } from "./cors-origins";

describe("parseCorsOrigins", () => {
  it("returns single origin or list", () => {
    expect(parseCorsOrigins("http://localhost:3000")).toBe("http://localhost:3000");
    expect(parseCorsOrigins("http://a.com, http://b.com")).toEqual([
      "http://a.com",
      "http://b.com",
    ]);
  });

  it("rejects wildcard alone or in a list when credentials remain enabled", () => {
    expect(() => parseCorsOrigins("*")).toThrow(/wildcard/i);
    expect(() => parseCorsOrigins("http://localhost:3000, *")).toThrow(/wildcard/i);
  });
});
