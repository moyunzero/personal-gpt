import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Citation } from "@personal-gpt/shared/types/kb";

const streamTextMock = vi.fn();

vi.mock("@personal-gpt/shared/ai/chat-provider", () => ({
  chatModel: (modelName: string) => ({ id: modelName, __mock: true as const }),
  resolveChatModels: () => ["mock-model"],
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
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { createChatStream } from "./stream";
import type { GraphPathDisplay } from "@/lib/chat/graph-path-display";

function mockTextStream(chunks: Array<{ type: string; text?: string }>) {
  streamTextMock.mockReturnValue({
    fullStream: (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
      yield { type: "finish" };
    })(),
  });
}

function mockSuccessfulTextStream(text: string) {
  mockTextStream([{ type: "text-delta", text }]);
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
    const textEndIndex = parts.findIndex((part) => (part as { type: string }).type === "text-end");
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

    expect(parts.some((part) => (part as { type: string }).type === "data-citations")).toBe(false);
  });

  it("strips Qwen think blocks from streamed text", async () => {
    const open = "<" + "think" + ">";
    const close = "<" + "/think" + ">";
    mockTextStream([
      { type: "text-delta", text: open + "内部推理" + close },
      { type: "text-delta", text: "最终回答" },
    ]);

    const stream = createChatStream({
      systemPrompt: "system",
      messages: [{ role: "user", content: "test" }],
      requestId: "req-3",
      citations: [],
    });

    const parts = await collectStreamParts(stream);
    const deltas = parts
      .filter((part) => (part as { type: string }).type === "text-delta")
      .map((part) => (part as { delta: string }).delta);

    expect(deltas.join("")).toBe("最终回答");
    expect(deltas.join("")).not.toContain("think");
  });

  it("uses chatModel from resolveChatModels (gateway-ready wiring)", async () => {
    mockSuccessfulTextStream("ok");
    await collectStreamParts(
      createChatStream({
        systemPrompt: "system",
        messages: [{ role: "user", content: "hi" }],
        requestId: "req-4",
        citations: [],
      }),
    );
    expect(streamTextMock).toHaveBeenCalled();
    const arg = streamTextMock.mock.calls[0]?.[0] as { model: { id: string; __mock: true } };
    expect(arg.model).toEqual({ id: "mock-model", __mock: true });
  });
});

describe("createChatStream graph paths (D-07)", () => {
  beforeEach(() => {
    streamTextMock.mockReset();
  });

  it("writes data-graph-paths after text stream with path summary, no cypher", async () => {
    mockSuccessfulTextStream("珍珠奶茶使用煮制工艺");

    const graphPaths: GraphPathDisplay[] = [
      {
        nodes: ["Product:珍珠奶茶", "Ingredient:珍珠", "Method:煮制"],
        relationships: ["CONTAINS", "USES"],
      },
    ];

    const stream = createChatStream({
      systemPrompt: "system",
      messages: [{ role: "user", content: "珍珠奶茶有哪些原料，用了什么工艺？" }],
      requestId: "req-graph",
      citations: [],
      graphPaths,
    });

    const parts = await collectStreamParts(stream);
    const textEndIndex = parts.findIndex((part) => (part as { type: string }).type === "text-end");
    const graphIndex = parts.findIndex(
      (part) => (part as { type: string }).type === "data-graph-paths",
    );

    expect(textEndIndex).toBeGreaterThan(-1);
    expect(graphIndex).toBeGreaterThan(textEndIndex);

    const dataPart = parts[graphIndex] as {
      type: string;
      data: { paths: GraphPathDisplay[] };
    };

    expect(dataPart.data.paths).toHaveLength(1);
    expect(dataPart.data.paths[0]!.nodes[0]).toContain("珍珠奶茶");

    const serialized = JSON.stringify(dataPart.data);
    expect(serialized).not.toMatch(/cypher/i);
    expect(serialized).not.toMatch(/MATCH/i);
  });

  it("does not write data-graph-paths when paths are empty", async () => {
    mockSuccessfulTextStream("你好");

    const stream = createChatStream({
      systemPrompt: "system",
      messages: [{ role: "user", content: "你好" }],
      requestId: "req-no-graph",
      citations: [],
      graphPaths: [],
    });

    const parts = await collectStreamParts(stream);
    expect(parts.some((part) => (part as { type: string }).type === "data-graph-paths")).toBe(
      false,
    );
  });
});
