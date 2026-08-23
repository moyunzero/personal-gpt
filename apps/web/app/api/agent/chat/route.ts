/**
 * Agent 模式 BFF：浏览器 → Next `/api/agent/chat` → agent-service。
 * 注入 AGENT_INTERNAL_TOKEN（若配置），避免把密钥暴露到 NEXT_PUBLIC_*。
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { retrievalContextHeaders, resolveRetrievalContext } from "@/lib/auth/acl-resolver";
import { requireSession } from "@/lib/auth/session";
import {
  ensureChatSession,
  ThreadOwnershipError,
} from "@/lib/chat/chat-session.service";
import { createThreadId, SAFE_THREAD_ID_PATTERN } from "@/lib/chat/thread-id";
import { logger } from "@/lib/logger";

import {
  AGENT_UPSTREAM_TIMEOUT_MS,
  combineAbortSignals,
  createUpstreamTimeoutSignal,
} from "./abort-signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Agent chat body 上限（约 1MB），防过大缓冲 */
export const MAX_AGENT_BFF_BODY_BYTES = 1_048_576;

function agentUpstreamUrl(): string {
  const base = (
    process.env.AGENT_SERVICE_URL ||
    process.env.NEXT_PUBLIC_AGENT_SERVICE_URL ||
    "http://localhost:3002"
  ).replace(/\/$/, "");
  return `${base}/agent/chat`;
}

/**
 * 把上游 body 泵到下游，直到读完 / 超时 / 客户端取消。
 * 客户端 abort → close；上游超时 → error（便于前端识别截断）。
 */
export function pipeUpstreamBody(
  upstreamBody: ReadableStream<Uint8Array>,
  opts: {
    clientSignal: AbortSignal;
    timeout: { signal: AbortSignal; clear: () => void };
  },
): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader();
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    opts.timeout.clear();
  };

  const cancelReader = () => {
    void reader.cancel().catch(() => {});
  };

  const onAbort = () => {
    cancelReader();
    cleanup();
  };

  if (opts.clientSignal.aborted || opts.timeout.signal.aborted) {
    cancelReader();
    cleanup();
  } else {
    opts.clientSignal.addEventListener("abort", onAbort, { once: true });
    opts.timeout.signal.addEventListener("abort", onAbort, { once: true });
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (opts.timeout.signal.aborted) {
          cancelReader();
          cleanup();
          controller.error(new Error("agent-service 请求已取消或超时"));
          return;
        }
        if (opts.clientSignal.aborted) {
          cancelReader();
          cleanup();
          controller.close();
          return;
        }
        const { done, value } = await reader.read();
        if (opts.timeout.signal.aborted) {
          cancelReader();
          cleanup();
          controller.error(new Error("agent-service 请求已取消或超时"));
          return;
        }
        if (opts.clientSignal.aborted) {
          cancelReader();
          cleanup();
          controller.close();
          return;
        }
        if (done) {
          cleanup();
          controller.close();
          return;
        }
        if (value) controller.enqueue(value);
      } catch (err) {
        cleanup();
        cancelReader();
        if (opts.timeout.signal.aborted) {
          controller.error(new Error("agent-service 请求已取消或超时"));
          return;
        }
        if (opts.clientSignal.aborted) {
          controller.close();
          return;
        }
        controller.error(err);
      }
    },
    cancel() {
      cancelReader();
      cleanup();
    },
  });
}

export async function POST(req: Request) {
  const authResult = await requireSession();
  if (authResult.error) return authResult.error;

  const retrievalCtx = await resolveRetrievalContext(authResult.session);
  const requestId = randomUUID();
  const upstream = agentUpstreamUrl();
  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  for (const [key, value] of Object.entries(retrievalContextHeaders(retrievalCtx))) {
    headers.set(key, value);
  }

  const token = process.env.AGENT_INTERNAL_TOKEN?.trim();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const timeout = createUpstreamTimeoutSignal(AGENT_UPSTREAM_TIMEOUT_MS);
  const signal = combineAbortSignals(req.signal, timeout.signal);

  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const n = Number(contentLength);
    if (Number.isFinite(n) && n > MAX_AGENT_BFF_BODY_BYTES) {
      timeout.clear();
      return NextResponse.json(
        { error: `请求体过大（上限 ${MAX_AGENT_BFF_BODY_BYTES} 字节）` },
        { status: 413 },
      );
    }
  }

  let bodyBuf: ArrayBuffer;
  try {
    bodyBuf = await req.arrayBuffer();
  } catch {
    timeout.clear();
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (bodyBuf.byteLength > MAX_AGENT_BFF_BODY_BYTES) {
    timeout.clear();
    return NextResponse.json(
      { error: `请求体过大（上限 ${MAX_AGENT_BFF_BODY_BYTES} 字节）` },
      { status: 413 },
    );
  }

  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = JSON.parse(new TextDecoder().decode(bodyBuf)) as Record<string, unknown>;
  } catch {
    timeout.clear();
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawThread =
    typeof parsedBody.thread_id === "string" && parsedBody.thread_id.trim()
      ? parsedBody.thread_id.trim()
      : createThreadId();
  if (!SAFE_THREAD_ID_PATTERN.test(rawThread)) {
    timeout.clear();
    return NextResponse.json({ error: "Invalid thread_id" }, { status: 400 });
  }

  try {
    await ensureChatSession({
      threadId: rawThread,
      userId: retrievalCtx.userId,
      workspaceId: retrievalCtx.workspaceId,
      mode: "agent",
    });
  } catch (err) {
    if (err instanceof ThreadOwnershipError) {
      timeout.clear();
      return NextResponse.json({ error: "Forbidden thread_id" }, { status: 403 });
    }
    throw err;
  }

  parsedBody.thread_id = rawThread;
  const outboundBody = JSON.stringify(parsedBody);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      method: "POST",
      headers,
      body: outboundBody,
      signal,
    });
  } catch (err) {
    timeout.clear();
    const message = err instanceof Error ? err.message : String(err);
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      req.signal.aborted ||
      timeout.signal.aborted;
    logger.error("agent BFF upstream fetch failed", {
      requestId,
      aborted,
      err: message,
    });
    // 固定中文关键词供 classifyAgentError；不回传上游细节
    return NextResponse.json(
      {
        error: aborted
          ? `agent-service 请求已取消或超时 (requestId: ${requestId})`
          : `agent-service 不可达 (requestId: ${requestId})`,
      },
      { status: aborted ? 504 : 502 },
    );
  }

  const outHeaders = new Headers();
  for (const key of ["content-type", "x-vercel-ai-ui-message-stream"] as const) {
    const v = upstreamRes.headers.get(key);
    if (v) outHeaders.set(key, v);
  }
  outHeaders.set("cache-control", "no-cache, no-transform");
  outHeaders.set("connection", "keep-alive");
  outHeaders.set("x-accel-buffering", "no");
  outHeaders.set("x-request-id", requestId);

  if (!upstreamRes.body) {
    timeout.clear();
    return new NextResponse(null, {
      status: upstreamRes.status,
      headers: outHeaders,
    });
  }

  const body = pipeUpstreamBody(upstreamRes.body, {
    clientSignal: req.signal,
    timeout,
  });

  return new NextResponse(body, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}
