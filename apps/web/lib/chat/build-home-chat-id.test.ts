import { describe, expect, it } from "vitest";

import { buildHomeChatId } from "./build-home-chat-id";

describe("buildHomeChatId", () => {
  const base = {
    mode: "chat" as const,
    threadId: "thread-a",
    corpus: "user",
    isAuthenticated: true as boolean | null,
    selectedModelId: "model-1",
  };

  it("joins home:mode:thread only", () => {
    expect(buildHomeChatId(base)).toBe("home:chat:thread-a");
  });

  it("changes when mode changes", () => {
    expect(buildHomeChatId({ ...base, mode: "agent" })).toBe("home:agent:thread-a");
  });

  it("changes when threadId changes", () => {
    const a = buildHomeChatId(base);
    const b = buildHomeChatId({ ...base, threadId: "thread-b" });
    expect(a).not.toBe(b);
    expect(b).toContain("thread-b");
  });

  it("does not change when model or corpus changes", () => {
    const a = buildHomeChatId(base);
    const b = buildHomeChatId({ ...base, selectedModelId: "model-2", corpus: "seed" });
    expect(a).toBe(b);
  });

  it("uses none when thread empty", () => {
    expect(buildHomeChatId({ ...base, threadId: "" })).toBe("home:chat:none");
  });
});
