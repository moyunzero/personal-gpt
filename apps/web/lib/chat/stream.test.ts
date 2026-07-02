import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Citation } from "@personal-gpt/shared/types/kb";

const streamTextMock = vi.fn();

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => (modelName: string) => modelName,
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: (...args: unknown[]) => streamTextMock(...args),
  };
});

vi.mock("@/lib/env", () => ({
  env: { OPENROUTER_API_KEY: "test-key" },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { createChatStream } from "./stream";

function mockSuccessfulTextStream(text: string) {
  streamTextMock.mockReturnValue({
    fullStream: (async function* () {
      yield { type: "text-delta", text };
      yield { type: "finish" };
    })(),
  });
}

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

describe("createChatStream citations", () => {
  beforeEach(() => {
    streamTextMock.mockReset();
  });

  it("writes data-citations after text stream completes (RAG-01)", async () => {
    mockSuccessfulTextStream("基于知识库的回答");

    const citations: Citation[] = [
      {
        documentId: "doc-1",
        title: "心晴 MO 介绍",
        similarity: 0.87,
        snippet: "心晴 MO 是一款情绪记录应用",
        source: "prompt-suggestion",
        chunkIndex: 0,
      },
    ];

    const stream = createChatStream({
      systemPrompt: "system",
      messages: [{ role: "user", content: "介绍一下心晴 MO 项目背景" }],
      requestId: "req-1",
      citations,
    });

    const parts = await collectStreamParts(stream);
    const textEndIndex = parts.findIndex(
      (part) => (part as { type: string }).type === "text-end",
    );
    const citationsIndex = parts.findIndex(
      (part) => (part as { type: string }).type === "data-citations",
    );

    expect(textEndIndex).toBeGreaterThan(-1);
    expect(citationsIndex).toBeGreaterThan(textEndIndex);

    const dataPart = parts[citationsIndex] as {
      type: string;
      data: { citations: Citation[] };
    };

    expect(dataPart.data.citations).toHaveLength(1);
    expect(dataPart.data.citations[0]).toMatchObject({
      documentId: "doc-1",
      title: "心晴 MO 介绍",
      similarity: 0.87,
      snippet: "心晴 MO 是一款情绪记录应用",
      source: "prompt-suggestion",
      chunkIndex: 0,
    });
  });

  it("does not write data-citations when citations are empty (RAG-03)", async () => {
    mockSuccessfulTextStream("你好呀");

    const stream = createChatStream({
      systemPrompt: "system",
      messages: [{ role: "user", content: "你好" }],
      requestId: "req-2",
      citations: [],
    });

    const parts = await collectStreamParts(stream);

    expect(
      parts.some((part) => (part as { type: string }).type === "data-citations"),
    ).toBe(false);
  });
});
