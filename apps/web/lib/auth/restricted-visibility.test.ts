import { describe, expect, it } from "vitest";

import { assertRestrictedAllowlist, RestrictedVisibilityError } from "./restricted-visibility";

describe("assertRestrictedAllowlist", () => {
  it("rejects empty or missing list", () => {
    expect(() => assertRestrictedAllowlist([])).toThrow(RestrictedVisibilityError);
    expect(() => assertRestrictedAllowlist(undefined)).toThrow(RestrictedVisibilityError);
  });

  it("returns non-empty list", () => {
    expect(assertRestrictedAllowlist(["u1"])).toEqual(["u1"]);
  });
});
