/**
 * Phase 4 regression #9 — agent session persist + cross-user thread_id (PROD-04 / D-23, D-30).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.ASTRA_DB_COLLECTION = "test_collection";
  process.env.ASTRA_DB_API_ENDPOINT = "https://test.example.com";
  process.env.ASTRA_DB_APPLICATION_TOKEN = "AstraCS:test";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test_key";
  process.env.GROQ_API_KEY = "test_groq_key";
  process.env.NIM_API_KEY = "test_nim_key";
});

const USER_A = "user-a-1111-1111-1111-111111111111";
const USER_B = "user-b-2222-2222-2222-222222222222";
const WORKSPACE = "ws-shared-3333-3333-3333-333333333333";
const THREAD_A = "thread-owned-by-a";

const sessionRow = {
  id: "sess-a",
  threadId: THREAD_A,
  userId: USER_A,
  workspaceId: WORKSPACE,
  mode: "agent" as const,
  title: "New chat",
};

const findOneMock = vi.fn();
const persistChatTurnMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/lib/db/get-data-source", () => ({
  getDataSource: vi.fn(async () => ({
    getRepository: () => ({
      findOne: findOneMock,
      create: vi.fn((row: unknown) => row),
      save: vi.fn(),
    }),
  })),
}));

vi.mock("@/lib/chat/chat-session.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat/chat-session.service")>();
  return {
    ...actual,
    persistChatTurn: (...args: unknown[]) => persistChatTurnMock(...args),
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(async () => ({
    session: {
      user: {
        id: USER_B,
        activeWorkspaceId: WORKSPACE,
      },
    },
  })),
}));

vi.mock("@/lib/auth/acl-resolver", () => ({
  resolveRetrievalContext: vi.fn(async () => ({
    userId: USER_B,
    workspaceId: WORKSPACE,
    allowedDocumentIds: [],
  })),
  retrievalContextHeaders: () => ({}),
}));

vi.mock("@/lib/middleware/api-guards", () => ({
  runApiGuards: vi.fn(async (_req: Request, _ctx: unknown, handler: () => Promise<Response>) =>
    handler(),
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { ensureChatSession, ThreadOwnershipError } from "@/lib/chat/chat-session.service";
import { tapAgentStreamForPersistence } from "@/lib/chat/agent-stream-persist";
import type { ChatSessionEntity } from "@/lib/db/entities/chat-session.entity";
import { POST } from "@/app/api/agent/chat/route";

function sseBody(deltas: string[]): ReadableStream<Uint8Array> {
  const events = deltas.flatMap((delta, i) => [
    ...(i === 0 ? [{ type: "text-start", id: "m1" }] : []),
    { type: "text-delta", id: "m1", delta },
  ]);
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!stream) return;
  const reader = stream.getReader();
  while (!(await reader.read()).done) {
    /* drain */
  }
}

describe("Phase 4 regression #9: agent session persist (D-23, D-30)", () => {
  beforeEach(() => {
    findOneMock.mockReset();
    persistChatTurnMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    persistChatTurnMock.mockResolvedValue(undefined);
  });

  it("D-30: ensureChatSession rejects cross-user thread_id (ThreadOwnershipError)", async () => {
    findOneMock.mockResolvedValue(sessionRow);

    await expect(
      ensureChatSession({
        threadId: THREAD_A,
        userId: USER_B,
        workspaceId: WORKSPACE,
        mode: "agent",
      }),
    ).rejects.toBeInstanceOf(ThreadOwnershipError);
  });

  it("D-30: POST /api/agent/chat returns 403 and does not call upstream fetch", async () => {
    findOneMock.mockResolvedValue(sessionRow);

    const req = new Request("http://localhost/api/agent/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        thread_id: THREAD_A,
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "resume checkpoint" }],
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Forbidden thread_id");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("D-23: tapAgentStreamForPersistence calls persistChatTurn with user and assistant text", async () => {
    const session = {
      id: "sess-1",
      threadId: THREAD_A,
      userId: USER_A,
      workspaceId: WORKSPACE,
      mode: "agent",
      title: "New chat",
    } as ChatSessionEntity;

    const upstream = sseBody(["Answer ", "text"]);
    const out = tapAgentStreamForPersistence(upstream, {
      session,
      userContent: "user question",
      upstreamStatus: 200,
    });

    await drain(out);

    expect(persistChatTurnMock).toHaveBeenCalledOnce();
    expect(persistChatTurnMock).toHaveBeenCalledWith({
      session,
      userContent: "user question",
      assistantContent: "Answer text",
    });
  });
});
