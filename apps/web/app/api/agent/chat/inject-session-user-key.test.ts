import { describe, expect, it } from "vitest";

import { injectSessionUserKey } from "./inject-session-user-key";

describe("injectSessionUserKey (D-12 / FIX-S2-01)", () => {
  it("deletes client userKey and sets session retrievalCtx.userId", () => {
    const body: Record<string, unknown> = {
      userKey: "forged-client-key",
      thread_id: "thread-1",
    };
    injectSessionUserKey(body, { userId: "session-user-42" });
    expect(body.userKey).toBe("session-user-42");
    expect(body.userKey).not.toBe("forged-client-key");
  });

  it("injects session id when client omitted userKey", () => {
    const body: Record<string, unknown> = { thread_id: "thread-2" };
    injectSessionUserKey(body, { userId: "real-user" });
    expect(body.userKey).toBe("real-user");
  });
});
