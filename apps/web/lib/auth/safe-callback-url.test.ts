import { describe, expect, it } from "vitest";

import { safeCallbackUrl } from "@/lib/auth/safe-callback-url";

describe("safeCallbackUrl", () => {
  const origin = "http://localhost:3000";

  it("allows same-origin relative paths", () => {
    expect(safeCallbackUrl("/", origin)).toBe("/");
    expect(safeCallbackUrl("/kb", origin)).toBe("/kb");
    expect(safeCallbackUrl("/?tab=1", origin)).toBe("/?tab=1");
  });

  it("blocks external origins", () => {
    expect(safeCallbackUrl("https://evil.com/phish", origin)).toBe("/");
    expect(safeCallbackUrl("//evil.com/path", origin)).toBe("/");
  });
});
