import { describe, expect, it } from "vitest";

import { resolveChatMemoryUserKey } from "@/lib/chat/memory-context";

describe("resolveChatMemoryUserKey (FIX-S2-01 / D-09)", () => {
  it("uses session user id for logged-in subjects", () => {
    expect(
      resolveChatMemoryUserKey({
        isGuest: false,
        sessionUserId: "user-session-42",
        bodyUserKey: "forged-client-key",
      }),
    ).toBe("user-session-42");
  });

  it("ignores a forged body.userKey when session is present", () => {
    const key = resolveChatMemoryUserKey({
      isGuest: false,
      sessionUserId: "real-user",
      bodyUserKey: "attacker-localStorage-key",
    });
    expect(key).toBe("real-user");
    expect(key).not.toBe("attacker-localStorage-key");
  });

  it("returns null for guests (no memory namespace)", () => {
    expect(
      resolveChatMemoryUserKey({
        isGuest: true,
        sessionUserId: "guest:abc",
        bodyUserKey: "any-key",
      }),
    ).toBeNull();
  });
});
