import { describe, expect, it } from "vitest";

import { chooseMemoryUserKey } from "./memory-session-key";

describe("chooseMemoryUserKey (D-09 / D-12)", () => {
  it("prefers retrievalCtx.userId over forged body userKey", () => {
    expect(
      chooseMemoryUserKey({ userId: "session-user-42" }, "forged-client-key"),
    ).toBe("session-user-42");
  });

  it("falls back to body userKey when retrievalCtx.userId absent", () => {
    expect(chooseMemoryUserKey(undefined, "anonymous")).toBe("anonymous");
    expect(chooseMemoryUserKey({ userId: "  " }, "body-key")).toBe("body-key");
  });
});
