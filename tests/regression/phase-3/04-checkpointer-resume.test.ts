/**
 * Phase 3 regression #4 — Checkpointer resume same thread_id (CP-01 / D-20–D-23)。
 * MemorySaver 模拟「重启」；禁止 live LLM。
 * PostgresSaver 用例需显式 RUN_POSTGRES_CHECKPOINTER=1（CI 仅有假 DATABASE_URL，不跑）。
 */
import { HumanMessage } from "@langchain/core/messages";
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  THREAD_STORAGE_KEYS,
  createThreadId,
  getOrCreateThreadId,
  rotateThreadId,
} from "../../../apps/web/lib/chat/thread-id";
import { AgentState } from "../../../apps/agent-service/src/graph/state";
import { getAgentRunConfig } from "../../../apps/agent-service/src/graph/build-graph";

describe("Phase 3 regression #4: checkpointer resume same thread_id (CP-01)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses distinct localStorage keys for chat vs agent (D-23)", () => {
    expect(THREAD_STORAGE_KEYS.chat).toBe("pgpt.thread.chat");
    expect(THREAD_STORAGE_KEYS.agent).toBe("pgpt.thread.agent");
    expect(THREAD_STORAGE_KEYS.chat).not.toBe(THREAD_STORAGE_KEYS.agent);

    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
      },
    });

    const chatId = getOrCreateThreadId("chat");
    const agentId = getOrCreateThreadId("agent");
    expect(chatId).toBeTruthy();
    expect(agentId).toBeTruthy();
    expect(chatId).not.toBe(agentId);
    expect(store.get(THREAD_STORAGE_KEYS.chat)).toBe(chatId);
    expect(store.get(THREAD_STORAGE_KEYS.agent)).toBe(agentId);

    const rotated = rotateThreadId("agent");
    expect(rotated).not.toBe(agentId);
    expect(store.get(THREAD_STORAGE_KEYS.agent)).toBe(rotated);
    expect(store.get(THREAD_STORAGE_KEYS.chat)).toBe(chatId);
  });

  it("resumes messages + todos + citations for the same thread_id after restart simulation", async () => {
    const checkpointer = new MemorySaver();
    const threadId = createThreadId();

    const buildGraph = () =>
      new StateGraph(AgentState)
        .addNode("seed", (state) => ({
          messages: state.messages,
          todos: state.todos,
          citations: state.citations,
          workspaceId: state.workspaceId,
        }))
        .addEdge(START, "seed")
        .addEdge("seed", END)
        .compile({ checkpointer });

    const graphA = buildGraph();
    await graphA.invoke(
      {
        messages: [new HumanMessage("差旅报销怎么走")],
        todos: [{ id: "t1", content: "检索政策", status: "completed" as const }],
        citations: [
          {
            documentId: "doc-policy",
            title: "差旅报销制度",
            similarity: 0.88,
            snippet: "需事先申请…",
            source: "kb",
          },
        ],
        workspaceId: "default",
      },
      getAgentRunConfig(threadId),
    );

    // 「重启」：新 compile，同一 MemorySaver + thread_id（等同 PostgresSaver 跨进程）
    const graphB = buildGraph();
    const snapped = await graphB.getState(getAgentRunConfig(threadId));
    const values = snapped.values as {
      messages?: unknown[];
      todos?: { id: string; content: string }[];
      citations?: { documentId: string }[];
    };

    expect(values.messages?.length).toBeGreaterThan(0);
    expect(values.todos?.some((t) => t.id === "t1" && t.content.includes("检索"))).toBe(true);
    expect(values.citations?.some((c) => c.documentId === "doc-policy")).toBe(true);
  });

  it.skipIf(process.env.RUN_POSTGRES_CHECKPOINTER !== "1")(
    "two logical replicas share thread_id via PostgresSaver (CP-01 / D-27)",
    async () => {
      const prevMode = process.env.AGENT_CHECKPOINTER;
      process.env.AGENT_CHECKPOINTER = "postgres";
      const { resetCheckpointerSingletonsForTests, ensureCheckpointerSetup, resolveCheckpointer } =
        await import("../../../apps/agent-service/src/graph/build-graph");

      resetCheckpointerSingletonsForTests();
      await ensureCheckpointerSetup();
      const checkpointer = await resolveCheckpointer();

      const threadId = createThreadId();
      const buildGraph = () =>
        new StateGraph(AgentState)
          .addNode("seed", (state) => ({
            messages: state.messages,
            todos: state.todos,
            citations: state.citations,
            workspaceId: state.workspaceId,
          }))
          .addEdge(START, "seed")
          .addEdge("seed", END)
          .compile({ checkpointer });

      const graphReplicaA = buildGraph();
      await graphReplicaA.invoke(
        {
          messages: [new HumanMessage("multi-instance resume")],
          todos: [{ id: "t-replica", content: "shared checkpoint", status: "completed" as const }],
          citations: [],
          workspaceId: "default",
        },
        getAgentRunConfig(threadId),
      );

      resetCheckpointerSingletonsForTests();
      await ensureCheckpointerSetup();
      const checkpointerB = await resolveCheckpointer();
      expect(checkpointerB).toBeTruthy();

      const graphReplicaB = buildGraph();
      const snapped = await graphReplicaB.getState(getAgentRunConfig(threadId));
      const values = snapped.values as {
        messages?: unknown[];
        todos?: { id: string; content: string }[];
      };

      expect(values.messages?.length).toBeGreaterThan(0);
      expect(values.todos?.some((t) => t.id === "t-replica")).toBe(true);

      if (prevMode === undefined) delete process.env.AGENT_CHECKPOINTER;
      else process.env.AGENT_CHECKPOINTER = prevMode;
      resetCheckpointerSingletonsForTests();
    },
    30_000,
  );
});
