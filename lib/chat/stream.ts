import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, createUIMessageStream } from "ai";

import { env } from "@/lib/env";

import type { FormattedMessage } from "./messages";

const { OPENROUTER_API_KEY } = env;

// 模块级单例：openrouter provider 不需要 mock 时不抽 DI。
const openrouter = createOpenRouter({ apiKey: OPENROUTER_API_KEY });

/**
 * 模型 fallback 顺序：把"真流式"模型放前面，"非流式"模型放后面兜底。
 * 这些是 OpenRouter 免费 tier，可用性周级波动；定期复测后调整。
 */
const MODELS = [
  "inclusionai/ring-2.6-1t:free", // ✅ 真流式（TTFT 3.3s，持续吐字 ~3.5s）
  "openai/gpt-oss-120b:free", // 🟡 未测，作为次选
  "nvidia/nemotron-3-super-120b-a12b:free", // ❌ 不流式（一次性 dump），最后兜底
] as const;

export interface ChatStreamOptions {
  systemPrompt: string;
  messages: FormattedMessage[];
  requestId: string;
}

/**
 * 构造与 useChat() 兼容的 UI Message Stream，按 MODELS 顺序尝试，
 * 首个成功的模型直接 return，全失败时写一个 error chunk。
 *
 * 错误处理：
 *   - 单个模型 throw：console.error 记录，落到下一个模型
 *   - 全部失败：服务端记录 lastError，客户端只看到 "服务暂时不可用 (requestId: ...)"
 */
export function createChatStream({
  systemPrompt,
  messages,
  requestId,
}: ChatStreamOptions) {
  return createUIMessageStream({
    execute: async ({ writer }) => {
      const messageId = `msg-${Date.now()}`;
      let hasStarted = false;
      let lastError: Error | null = null;

      for (const modelName of MODELS) {
        try {
          const result = streamText({
            model: openrouter(modelName),
            system: systemPrompt,
            messages,
            temperature: 0.7,
            maxRetries: 1, // 减少重试次数，快速切换到下一个模型
          });

          // 将 streamText 的输出转换为 UI Message Chunks
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              if (!hasStarted) {
                writer.write({ type: "text-start", id: messageId });
                hasStarted = true;
              }
              writer.write({
                type: "text-delta",
                delta: part.text,
                id: messageId,
              });
            } else if (part.type === "finish") {
              writer.write({ type: "text-end", id: messageId });
            } else if (part.type === "error") {
              throw part.error;
            }
          }

          // 成功跳出
          return;
        } catch (error) {
          console.error(`Model ${modelName} failed:`, error);
          lastError = error instanceof Error ? error : new Error(String(error));
          // 不是最后一个模型就继续 fallback
          if (modelName !== MODELS[MODELS.length - 1]) {
            continue;
          }
        }
      }

      // 所有模型都失败了：服务端记录详细错误，客户端只看到通用文案 + requestId
      console.error(`[chat][${requestId}] 所有模型均失败:`, lastError);
      writer.write({
        type: "error",
        errorText: `服务暂时不可用，请稍后重试 (requestId: ${requestId})`,
      });
    },
    onError: (error) => {
      // onError 的返回值会被序列化到流里给客户端看，因此不能透出原始 message
      console.error(`[chat][${requestId}] stream onError:`, error);
      return `服务暂时不可用，请稍后重试 (requestId: ${requestId})`;
    },
  });
}
