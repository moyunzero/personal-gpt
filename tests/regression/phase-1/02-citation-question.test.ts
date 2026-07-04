import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Citation } from "@personal-gpt/shared/types/kb";

const searchMock = vi.fn();
const streamTextMock = vi.fn();

vi.mock("@personal-gpt/shared/stores/vector-store.astra", () => ({
  createVectorStore: () => ({ search: searchMock }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    ASTRA_DB_COLLECTION: "test-collection",
    VECTOR_SEARCH_TIMEOUT_MS: 5000,
    EMBEDDING_CACHE_SIZE: 100,
  },
}));

vi.mock("@personal-gpt/shared/ai/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock("@/lib/chat/tracing", () => ({
  traceRetrieveStep: (_step: string, _ctx: unknown, fn: () => Promise<unknown>) => fn(),
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

import { getRelevantContext } from "@/lib/chat/retrieve";
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

describe("Phase 1 regression #2: citation on relevant question", () => {
  beforeEach(() => {
    searchMock.mockReset();
    streamTextMock.mockReset();
  });

  it("returns citations with visible similarity and streams data-citations part", async () => {
    searchMock.mockResolvedValue([
      {
        text: "Personal GPT 是一个企业级知识库聊天平台。",
        similarity: 0.91,
        source: "uploaded-pdf",
        title: "产品说明",
        documentId: "doc-upload-1",
        chunkIndex: 0,
      },
    ]);

    const result = await getRelevantContext("请介绍一下 Personal GPT 项目的核心功能", "reg-2");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.citations.length).toBeGreaterThanOrEqual(1);
    expect(result.citations[0]?.similarity).toBeGreaterThan(0);
    expect(result.citations[0]?.documentId).toBe("doc-upload-1");

    streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "根据知识库，Personal GPT 是…" };
        yield { type: "finish" };
      })(),
    });

    const stream = createChatStream({
      systemPrompt: "system",
      messages: [{ role: "user", content: "请介绍一下 Personal GPT 项目的核心功能" }],
      requestId: "reg-2",
      citations: result.citations as Citation[],
    });

    const parts = await collectStreamParts(stream);
    const citationPart = parts.find(
      (part) => (part as { type: string }).type === "data-citations",
    ) as { data: { citations: Citation[] } } | undefined;

    expect(citationPart).toBeDefined();
    expect(citationPart!.data.citations.length).toBeGreaterThanOrEqual(1);
    expect(citationPart!.data.citations[0]?.similarity).toBeGreaterThan(0);
  });
});
