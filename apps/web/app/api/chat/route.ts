import { graphRagQuery } from "@personal-gpt/shared";
import { createUIMessageStreamResponse } from "ai";
import { randomUUID } from "node:crypto";

import { resolveRetrievalContext } from "@/lib/auth/acl-resolver";
import { requireSession } from "@/lib/auth/session";
import {
  ensureChatSession,
  persistChatTurn,
  ThreadOwnershipError,
} from "@/lib/chat/chat-session.service";
import { createThreadId } from "@/lib/chat/thread-id";

import { graphPathsToDisplay } from "@/lib/chat/graph-path-display";
import { type VectorSearchResult } from "@/lib/chat/context";
import { parseCorpus } from "@/lib/chat/corpus-filters";
import { loadMemoryContextBlock, parseUserKey, persistTurnMemory } from "@/lib/chat/memory-context";
import { formatMessages, type InputMessage } from "@/lib/chat/messages";
import { buildSystemPrompt } from "@/lib/chat/prompt";
import { decideQueryRoute } from "@/lib/chat/query-router";
import { getRelevantContext } from "@/lib/chat/retrieve";
import { createChatStream } from "@/lib/chat/stream";
import "@/lib/env";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const MAX_CHAT_MESSAGES = 50;
const GRAPH_RAG_TIMEOUT_MS = 12_000;
const MEMORY_LOAD_TIMEOUT_MS = 1_500;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withGraphRagTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return withTimeout(promise, ms, "graph_rag");
}

function isTrustedInternalProxy(req: Request): boolean {
  const expected = process.env.INTERNAL_PROXY_KEY;
  if (!expected) return false;
  return req.headers.get("x-internal-proxy-key") === expected;
}

// ====================== CORS 白名单（跨域作品集集成）======================
// personalWeb-1 部署在 GitHub Pages，与本服务跨域，需在服务端补 CORS + Origin 硬校验。
// 注意：Access-Control-Allow-Origin 不能写 *，本接口会消耗 Groq token，必须配白名单。
const ALLOWED_ORIGINS = new Set<string>([
  // personal-gpt 自身（同源调用：本地 dev + Vercel 生产）
  "http://localhost:3000", // Next.js dev 同源
  "https://personal-emotion-gpt.vercel.app", // Vercel 生产同源
  // personalWeb-1（跨域作品集前端）
  "http://localhost:5173", // Vite dev
  "http://localhost:4173", // Vite preview
  "https://moyunzero.github.io", // GitHub Pages 默认域
]);

function buildCorsHeaders(origin: string | null): Record<string, string> {
  // origin 未命中白名单时，把 Allow-Origin 留空，浏览器侧自动拦截响应。
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    // 让 CDN 按 origin 分缓存，避免错误的 Allow-Origin 串台
    Vary: "Origin",
  };
}

function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) return true;

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      if (ALLOWED_ORIGINS.has(new URL(referer).origin)) return true;
    } catch {
      // invalid referer URL
    }
  }
  return false;
}

// CORS 预检：所有浏览器在跨域 POST 之前都会先发 OPTIONS。
export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(req.headers.get("origin")),
  });
}

/**
 * 聊天接口。本文件只做：
 *   1. CORS + Origin 硬校验（跨域作品集集成）
 *   2. 限流（按 IP，fail-open）
 *   3. 解析 / 校验请求体
 *   4. 调 query-router 决定 direct（模型直答）或 retrieve（向量检索）
 *   5. 把检索结果交给 buildSystemPrompt
 *   6. 把 system + messages 交给 createChatStream，包成 UIMessageStreamResponse
 *   7. 顶层 try-catch + requestId 错误响应
 *
 * 业务细节（检索、prompt 文案、模型 fallback、流式协议）全在 lib/chat/* 各自模块里。
 */
export async function POST(req: Request) {
  // 每次请求生成一个 requestId：
  //   - 客户端只看到 requestId（不暴露 stack / message）
  //   - 服务端 log 带上 requestId，便于在日志里串起故障链路
  const requestId = randomUUID();
  const log = logger.child({ scope: "chat.route", requestId });
  // 每个响应都要带这组头：CORS 只是浏览器侧的保护，下面的 isOriginAllowed 才是服务端硬校验。
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  // ====================== Origin 硬校验（防盗刷） ======================
  // CORS 拦不住 curl / 爬虫，必须在路由开头做服务端校验，非白名单直接 403。
  if (!isTrustedInternalProxy(req) && !isOriginAllowed(req)) {
    log.metric("origin.rejected", {
      origin: req.headers.get("origin") ?? "<none>",
      referer: req.headers.get("referer") ?? "<none>",
    });
    return new Response(JSON.stringify({ error: "Forbidden origin", requestId }), {
      status: 403,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const authResult = await requireSession();
    if (authResult.error) {
      return new Response(JSON.stringify({ error: "Unauthorized", requestId }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const retrievalCtx = await resolveRetrievalContext(authResult.session);

    // ====================== 限流（C1） ======================
    // 按客户端 IP 限流 10 req / 60s 滑动窗口。
    // checkRateLimit 内部对 Upstash 故障已做 fail-open，不会抛错。
    const rl = await checkRateLimit(authResult.session.user.id, requestId);
    if (!rl.success) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter: rl.retryAfterSeconds,
          requestId,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rl.retryAfterSeconds),
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rl.reset),
            ...corsHeaders,
          },
        },
      );
    }

    const body = (await req.json()) as {
      messages?: unknown;
      corpus?: unknown;
      userKey?: unknown;
      thread_id?: unknown;
    };
    const { messages } = body;
    // D-27/D-28 / T-03-seed: default user; seed only when explicit
    const corpus = parseCorpus(body.corpus);
    const userKey = parseUserKey(body.userKey);

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("No messages provided", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const trimmedMessages =
      messages.length > MAX_CHAT_MESSAGES ? messages.slice(-MAX_CHAT_MESSAGES) : messages;

    const formattedMessages = formatMessages(trimmedMessages as InputMessage[]);

    const rawThreadId =
      typeof body.thread_id === "string" && body.thread_id.trim()
        ? body.thread_id.trim()
        : createThreadId();
    let chatSession;
    try {
      chatSession = await ensureChatSession({
        threadId: rawThreadId,
        userId: retrievalCtx.userId,
        workspaceId: retrievalCtx.workspaceId,
        mode: "chat",
      });
    } catch (err) {
      if (err instanceof ThreadOwnershipError) {
        return new Response(JSON.stringify({ error: "Forbidden thread_id", requestId }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      throw err;
    }

    // 取最后一条做向量搜索 + 长度校验
    const lastContent = formattedMessages[formattedMessages.length - 1]?.content || "";

    if (lastContent.length > 8000) {
      return new Response("Message too long", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const routeDecision = await decideQueryRoute(lastContent, {
      workspaceId: retrievalCtx.workspaceId,
      requestId,
      corpus,
    });
    log.debug("query route", {
      corpus,
      route: routeDecision.route,
      reason: routeDecision.reason,
      fastPath: routeDecision.fastPath ?? false,
      precheckSimilarity: routeDecision.precheckSimilarity,
    });

    let contextResult: VectorSearchResult = { kind: "no-docs" };
    const graphOnlyRetrieve =
      routeDecision.intentPrimary === "graph_relation" && routeDecision.needsGraphContext;
    if (routeDecision.route === "retrieve" && !graphOnlyRetrieve) {
      contextResult = await getRelevantContext(lastContent, requestId, retrievalCtx.workspaceId, {
        corpus,
        documentIds: retrievalCtx.allowedDocumentIds,
      });
    }

    let graphSummary = "";
    let graphPathsForUi = graphPathsToDisplay([]);
    if (routeDecision.needsGraphContext && corpus === "seed") {
      try {
        const graphResult = await withGraphRagTimeout(
          graphRagQuery({
            question: lastContent,
            workspaceId: retrievalCtx.workspaceId,
            documentIds: retrievalCtx.allowedDocumentIds,
          }),
          GRAPH_RAG_TIMEOUT_MS,
        );
        if (graphResult.paths.length > 0) {
          graphSummary = graphResult.summary;
          graphPathsForUi = graphPathsToDisplay(graphResult.paths);
        }
      } catch (err) {
        log.warn("graphRagQuery failed, continuing without graph context", { err });
      }
    }

    if (graphOnlyRetrieve && graphPathsForUi.length === 0 && routeDecision.route === "retrieve") {
      contextResult = await getRelevantContext(lastContent, requestId, retrievalCtx.workspaceId, {
        corpus,
        documentIds: retrievalCtx.allowedDocumentIds,
      });
    }

    const citations = contextResult.kind === "ok" ? contextResult.citations : [];

    // 把检索结果记一条 telemetry，让 ok / no-docs / timeout / api-error 在
    // 同一个 [METRIC] 命名空间下，便于 grep 与未来接入 metrics 客户端。
    if (contextResult.kind === "ok") {
      log.metric("vector.search.ok", {
        docCount: contextResult.docCount,
        sources: contextResult.sources,
      });
    } else if (contextResult.kind === "no-docs" && routeDecision.route === "retrieve") {
      log.metric("vector.search.no_docs", { queryLength: lastContent.length });
    }
    // timeout / api-error 的日志在 getRelevantContext 里已经发过，避免重复。

    const systemPromptBase = buildSystemPrompt(contextResult);
    const graphBlock = graphSummary ? `\n\n## 图谱知识\n${graphSummary}` : "";
    let memoryBlock = "";
    if (userKey) {
      try {
        memoryBlock = await withTimeout(
          loadMemoryContextBlock({ workspaceId: retrievalCtx.workspaceId, userKey }, lastContent),
          MEMORY_LOAD_TIMEOUT_MS,
          "memory_load",
        );
      } catch {
        memoryBlock = "";
      }
    }
    const systemPrompt = memoryBlock
      ? `${systemPromptBase}${graphBlock}\n\n${memoryBlock}`
      : `${systemPromptBase}${graphBlock}`;

    const stream = createChatStream({
      systemPrompt,
      messages: formattedMessages,
      requestId,
      citations,
      graphPaths: graphPathsForUi,
      onComplete: async (assistantText) => {
        await persistChatTurn({
          session: chatSession,
          userContent: lastContent,
          assistantContent: assistantText,
        });
        if (userKey) {
          await persistTurnMemory(
            { workspaceId: retrievalCtx.workspaceId, userKey },
            lastContent,
            assistantText,
          );
        }
      },
    });

    // SSE 响应默认只有 text/event-stream，需要手动注入 CORS 头（空值的不写）
    const streamResponse = createUIMessageStreamResponse({ stream });
    Object.entries(corsHeaders).forEach(([key, value]) => {
      if (value) streamResponse.headers.set(key, value);
    });
    return streamResponse;
  } catch (error) {
    // 把详细错误留在服务端，客户端只能拿到 requestId
    log.error("unhandled error", { err: error });
    return new Response(JSON.stringify({ error: "Internal server error", requestId }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}
