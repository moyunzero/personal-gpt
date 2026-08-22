import { chatModel, resolveChatModels } from "@personal-gpt/shared/ai/chat-provider";
import type { Citation } from "@personal-gpt/shared/types/kb";
import { streamText, createUIMessageStream } from "ai";

import { logger } from "@/lib/logger";

import type { GraphPathDisplay } from "@/lib/chat/graph-path-display";

import type { FormattedMessage } from "./messages";
import { ThinkStripFilter } from "./think-strip";

export interface ChatStreamOptions {
  systemPrompt: string;
  messages: FormattedMessage[];
  requestId: string;
  citations?: Citation[];
  /** D-07: graph path cards — no cypher field */
  graphPaths?: GraphPathDisplay[];
  /** 流成功结束后回调（用于短期记忆 / Mem0 持久化）；失败不调用 */
  onComplete?: (assistantText: string) => void | Promise<void>;
}

/**
 * 构造与 useChat() 兼容的 UI Message Stream，按 MODELS 顺序尝试，
 * 首个成功的模型直接 return，全失败时写一个 error chunk。
 *
 * 文本流全部 flush 后，若 citations 非空则追加 data-citations part（D-07/D-09）。
 */
export function createChatStream({
  systemPrompt,
  messages,
  requestId,
  citations = [],
  graphPaths = [],
  onComplete,
}: ChatStreamOptions) {
  const log = logger.child({ scope: "chat.stream", requestId });

  return createUIMessageStream({
    execute: async ({ writer }) => {
      const messageId = `msg-${Date.now()}`;
      let hasStarted = false;
      let lastError: Error | null = null;

      const models = resolveChatModels();
      for (let i = 0; i < models.length; i++) {
        const modelName = models[i]!;
        try {
          const result = streamText({
            model: chatModel(modelName),
            system: systemPrompt,
            messages,
            temperature: 0.7,
            maxRetries: 0,
          });

          const thinkFilter = new ThinkStripFilter();
          let assistantText = "";

          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              const visible = thinkFilter.feed(part.text);
              if (!visible) continue;
              assistantText += visible;
              if (!hasStarted) {
                writer.write({ type: "text-start", id: messageId });
                hasStarted = true;
              }
              writer.write({
                type: "text-delta",
                delta: visible,
                id: messageId,
              });
            } else if (part.type === "finish") {
              const trailing = thinkFilter.flush();
              if (trailing) {
                assistantText += trailing;
                if (!hasStarted) {
                  writer.write({ type: "text-start", id: messageId });
                  hasStarted = true;
                }
                writer.write({
                  type: "text-delta",
                  delta: trailing,
                  id: messageId,
                });
              }
              if (hasStarted) {
                writer.write({ type: "text-end", id: messageId });
              }
            } else if (part.type === "error") {
              throw part.error;
            }
          }

          if (citations.length > 0) {
            writer.write({
              type: "data-citations",
              id: `citations-${messageId}`,
              data: { citations },
            });
          }

          if (graphPaths.length > 0) {
            writer.write({
              type: "data-graph-paths",
              id: `graph-paths-${messageId}`,
              data: { paths: graphPaths },
            });
          }

          if (onComplete) {
            try {
              await onComplete(assistantText);
            } catch (err) {
              log.warn("onComplete failed (ignored)", { err });
            }
          }

          return;
        } catch (error) {
          log.warn("model failed, falling back", { modelName, err: error });
          lastError = error instanceof Error ? error : new Error(String(error));
          if (i < models.length - 1) {
            continue;
          }
        }
      }

      log.error("all models failed", { err: lastError });
      writer.write({
        type: "error",
        errorText: `服务暂时不可用，请稍后重试 (requestId: ${requestId})`,
      });
    },
    onError: (error) => {
      log.error("stream onError", { err: error });
      return `服务暂时不可用，请稍后重试 (requestId: ${requestId})`;
    },
  });
}
