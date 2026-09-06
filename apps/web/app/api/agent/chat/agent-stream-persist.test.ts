import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatSessionEntity } from "@/lib/db/entities/chat-session.entity";

const persistChatTurnMock = vi.fn();

vi.mock("@/lib/chat/chat-session.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat/chat-session.service")>();
  return {
    ...actual,
    persistChatTurn: (...args: unknown[]) => persistChatTurnMock(...args),
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

import {
  extractLastUserContentFromMessages,
  tapAgentStreamForPersistence,
} from "@/lib/chat/agent-stream-persist";

const SESSION = {
  id: "sess-1",
  threadId: "thread-abc",
  userId: "user-1",
  workspaceId: "ws-1",
  mode: "agent",
  title: "New chat",
} as ChatSessionEntity;

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

async function drainStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}

describe("tapAgentStreamForPersistence", () => {
  beforeEach(() => {
    persistChatTurnMock.mockReset();
    persistChatTurnMock.mockResolvedValue(undefined);
  });

  it("accumulates text-delta and persists on stream close when upstream 2xx", async () => {
    const upstream = sseStream([
      { type: "text-start", id: "m1" },
      { type: "text-delta", id: "m1", delta: "Hello " },
      { type: "text-delta", id: "m1", delta: "world" },
      { type: "text-end", id: "m1" },
    ]);

    const out = tapAgentStreamForPersistence(upstream, {
      session: SESSION,
      userContent: "user question",
      upstreamStatus: 200,
    });

    await drainStream(out);

    expect(persistChatTurnMock).toHaveBeenCalledOnce();
    expect(persistChatTurnMock).toHaveBeenCalledWith({
      session: SESSION,
      userContent: "user question",
      assistantContent: "Hello world",
    });
  });

  it("does not persist when upstream status is not 2xx", async () => {
    const upstream = sseStream([{ type: "text-delta", id: "m1", delta: "oops" }]);

    const out = tapAgentStreamForPersistence(upstream, {
      session: SESSION,
      userContent: "q",
      upstreamStatus: 502,
    });

    await drainStream(out);
    expect(persistChatTurnMock).not.toHaveBeenCalled();
  });

  it("does not persist when assistant text is empty", async () => {
    const upstream = sseStream([{ type: "data-agent-step", id: "s1", data: {} }]);

    const out = tapAgentStreamForPersistence(upstream, {
      session: SESSION,
      userContent: "q",
      upstreamStatus: 200,
    });

    await drainStream(out);
    expect(persistChatTurnMock).not.toHaveBeenCalled();
  });

  it("fail-open when persistChatTurn throws", async () => {
    persistChatTurnMock.mockRejectedValue(new Error("db down"));
    const upstream = sseStream([{ type: "text-delta", id: "m1", delta: "ok" }]);

    const out = tapAgentStreamForPersistence(upstream, {
      session: SESSION,
      userContent: "q",
      upstreamStatus: 200,
    });

    const text = await drainStream(out);
    expect(text).toContain("text-delta");
    expect(persistChatTurnMock).toHaveBeenCalled();
  });

  it("passes through upstream bytes unchanged", async () => {
    const upstream = sseStream([{ type: "text-delta", id: "m1", delta: "x" }]);
    const out = tapAgentStreamForPersistence(upstream, {
      session: SESSION,
      userContent: "q",
      upstreamStatus: 200,
    });
    const text = await drainStream(out);
    expect(text).toContain('"delta":"x"');
  });
});

describe("extractLastUserContentFromMessages", () => {
  it("returns last user message text from UIMessage parts", () => {
    const text = extractLastUserContentFromMessages([
      { role: "user", parts: [{ type: "text", text: "first" }] },
      { role: "assistant", parts: [{ type: "text", text: "reply" }] },
      { role: "user", parts: [{ type: "text", text: "second question" }] },
    ]);
    expect(text).toBe("second question");
  });

  it("returns empty string when no user messages", () => {
    expect(extractLastUserContentFromMessages([])).toBe("");
    expect(extractLastUserContentFromMessages(null)).toBe("");
  });
});
