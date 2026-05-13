import { createUIMessageStreamResponse } from "ai";
import { randomUUID } from "node:crypto";

import { type VectorSearchResult } from "@/lib/chat/context";
import { formatMessages, type InputMessage } from "@/lib/chat/messages";
import { buildSystemPrompt } from "@/lib/chat/prompt";
import { shouldUseVectorSearch } from "@/lib/chat/query-classifier";
import { getRelevantContext } from "@/lib/chat/retrieve";
import { createChatStream } from "@/lib/chat/stream";

/**
 * 聊天接口。本文件只做：
 *   1. 解析 / 校验请求体
 *   2. 调 query-classifier 决定是否走向量检索
 *   3. 把检索结果交给 buildSystemPrompt
 *   4. 把 system + messages 交给 createChatStream，包成 UIMessageStreamResponse
 *   5. 顶层 try-catch + requestId 错误响应
 *
 * 业务细节（检索、prompt 文案、模型 fallback、流式协议）全在 lib/chat/* 各自模块里。
 */
export async function POST(req: Request) {
  // 每次请求生成一个 requestId：
  //   - 客户端只看到 requestId（不暴露 stack / message）
  //   - 服务端 console.error 带上 requestId，便于在日志里串起故障链路
  const requestId = randomUUID();

  try {
    const { messages } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response("No messages provided", { status: 400 });
    }

    const formattedMessages = formatMessages(messages as InputMessage[]);

    // 取最后一条做向量搜索 + 长度校验
    const lastContent =
      formattedMessages[formattedMessages.length - 1]?.content || "";

    if (lastContent.length > 8000) {
      return new Response("Message too long", { status: 400 });
    }

    // 智能判断是否需要向量检索；不需要时直接走默认 no-docs 分支
    const needsContext = shouldUseVectorSearch(lastContent);
    let contextResult: VectorSearchResult = { kind: "no-docs" };
    if (needsContext) {
      contextResult = await getRelevantContext(lastContent, requestId);
    }

    // 把检索结果记一条 telemetry，让 ok / no-docs / timeout / api-error 在
    // 同一个 [METRIC] 命名空间下，便于 grep 与未来接入 metrics 客户端。
    if (contextResult.kind === "ok") {
      console.log(`[METRIC] vector.search.ok`, {
        requestId,
        docCount: contextResult.docCount,
        sources: contextResult.sources,
      });
    } else if (contextResult.kind === "no-docs" && needsContext) {
      console.log(`[METRIC] vector.search.no_docs`, {
        requestId,
        queryLength: lastContent.length,
      });
    }
    // timeout / api-error 的日志在 getRelevantContext 里已经发过，避免重复。

    const systemPrompt = buildSystemPrompt(contextResult);

    const stream = createChatStream({
      systemPrompt,
      messages: formattedMessages,
      requestId,
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    // 把详细错误留在服务端，客户端只能拿到 requestId
    console.error(`[chat][${requestId}] 未处理异常:`, error);
    return new Response(
      JSON.stringify({ error: "Internal server error", requestId }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
