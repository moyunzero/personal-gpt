import { describe, expect, it } from "vitest";

import { parseCorpus, ROUTE_CORPUS_FILTER } from "./corpus-filters";

describe("parseCorpus", () => {
  it("defaults to user when omitted or invalid (D-27 / T-03-seed)", () => {
    expect(parseCorpus(undefined)).toBe("user");
    expect(parseCorpus(null)).toBe("user");
    expect(parseCorpus("user")).toBe("user");
    expect(parseCorpus("SEED")).toBe("user");
    expect(parseCorpus(1)).toBe("user");
  });

  it("accepts explicit seed only", () => {
    expect(parseCorpus("seed")).toBe("seed");
  });
});

describe("ROUTE_CORPUS_FILTER", () => {
  it("remains available for embedding-precheck (deprecated for retrieve)", () => {
    expect(ROUTE_CORPUS_FILTER.$or.length).toBeGreaterThan(0);
  });
});
