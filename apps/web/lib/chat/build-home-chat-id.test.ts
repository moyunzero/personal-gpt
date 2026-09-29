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

  it("joins home:mode:thread:corpus:model", () => {
    expect(buildHomeChatId(base)).toBe("home:chat:thread-a:user:model-1");
  });

  it("changes when mode changes", () => {
    expect(buildHomeChatId({ ...base, mode: "agent" })).toBe(
      "home:agent:thread-a:user:model-1",
    );
  });

  it("changes when threadId changes", () => {
    const a = buildHomeChatId(base);
    const b = buildHomeChatId({ ...base, threadId: "thread-b" });
    expect(a).not.toBe(b);
    expect(b).toContain("thread-b");
  });

  it("fails closed if threadId were dropped from the id", () => {
    const id = buildHomeChatId(base);
    expect(id.split(":")).toContain("thread-a");
  });

  it("changes when corpus changes for authenticated users", () => {
    expect(buildHomeChatId({ ...base, corpus: "seed" })).toBe(
      "home:chat:thread-a:seed:model-1",
    );
  });

  it("forces seed corpus segment for guests regardless of corpus toggle", () => {
    expect(
      buildHomeChatId({
        ...base,
        isAuthenticated: false,
        corpus: "user",
      }),
    ).toBe("home:chat:thread-a:seed:model-1");
  });

  it("changes when selectedModelId changes", () => {
    expect(buildHomeChatId({ ...base, selectedModelId: "model-2" })).toBe(
      "home:chat:thread-a:user:model-2",
    );
  });

  it("uses none and default when thread/model empty", () => {
    expect(
      buildHomeChatId({
        ...base,
        threadId: "",
        selectedModelId: "",
      }),
    ).toBe("home:chat:none:user:default");
  });
});
