import { describe, expect, it } from "vitest";

import { assertRestrictedAllowlist } from "./restricted-visibility";

describe("assertRestrictedAllowlist", () => {
  it("rejects empty or missing list", () => {
    expect(() => assertRestrictedAllowlist([])).toThrow(/restrictedUserIds/);
    expect(() => assertRestrictedAllowlist(undefined)).toThrow(/restrictedUserIds/);
  });

  it("returns non-empty list", () => {
    expect(assertRestrictedAllowlist(["u1"])).toEqual(["u1"]);
  });
});
