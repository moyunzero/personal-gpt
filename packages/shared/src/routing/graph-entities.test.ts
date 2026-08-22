import { describe, expect, it } from "vitest";

import { hasSeedGraphEntity, resolveSeedProductName } from "./graph-entities";

describe("graph-entities", () => {
  it("detects seed entities only", () => {
    expect(hasSeedGraphEntity("珍珠奶茶有哪些原料？")).toBe(true);
    expect(hasSeedGraphEntity("pearl milk tea process")).toBe(true);
    expect(hasSeedGraphEntity("奶茶工艺")).toBe(false);
    expect(hasSeedGraphEntity("心理学有哪些内容")).toBe(false);
  });

  it("resolveSeedProductName returns null when no seed entity", () => {
    expect(resolveSeedProductName("奶茶有哪些原料")).toBeNull();
  });
});
