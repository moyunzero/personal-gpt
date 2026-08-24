import { describe, expect, it } from "vitest";

import { mapPersistedMessages, sessionCacheKey } from "./session-messages";

describe("session-messages", () => {
  it("maps persisted rows to useChat parts shape", () => {
    const rows = [
      { id: "1", role: "user", content: "你好" },
      { id: "2", role: "assistant", content: "你好呀" },
    ];
    expect(mapPersistedMessages(rows)).toEqual([
      { id: "1", role: "user", parts: [{ type: "text", text: "你好" }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "你好呀" }] },
    ]);
  });

  it("builds stable cache keys per mode+thread", () => {
    expect(sessionCacheKey("chat", "abc")).toBe("chat:abc");
    expect(sessionCacheKey("agent", "abc")).toBe("agent:abc");
  });
});
