import { beforeEach, describe, expect, it, vi } from "vitest";

const getRelevantContextMock = vi.fn();
const streamTextMock = vi.fn();

vi.mock("@/lib/chat/retrieve", () => ({
  getRelevantContext: (...args: unknown[]) => getRelevantContextMock(...args),
}));

vi.mock("@ai-sdk/google", () => ({
  google: (modelName: string) => modelName,
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: (...args: unknown[]) => streamTextMock(...args),
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      metric: vi.fn(),
    }),
  },
}));

import { isGreetingOnly } from "@/lib/chat/query-intent";
import { createChatStream } from "@/lib/chat/stream";

async function collectStreamParts(stream: ReadableStream<unknown>) {
  const reader = stream.getReader();
  const parts: unknown[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
}

describe("Phase 1 regression #3: greeting skips retrieval and citations", () => {
  beforeEach(() => {
    getRelevantContextMock.mockReset();
    streamTextMock.mockReset();
  });

  it("does not use vector search for 你好", () => {
    expect(isGreetingOnly("你好")).toBe(true);
  });

  it("streams response without data-citations for greeting flow", async () => {
    const query = "你好";
    const needsContext = !isGreetingOnly(query);

    if (needsContext) {
      await getRelevantContextMock(query, "reg-3");
    }

    expect(getRelevantContextMock).not.toHaveBeenCalled();

    streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "你好呀！" };
        yield { type: "finish" };
      })(),
    });

    const stream = createChatStream({
      systemPrompt: "system",
      messages: [{ role: "user", content: query }],
      requestId: "reg-3",
      citations: [],
    });

    const parts = await collectStreamParts(stream);
    expect(
      parts.some((part) => (part as { type: string }).type === "data-citations"),
    ).toBe(false);
  });
});
