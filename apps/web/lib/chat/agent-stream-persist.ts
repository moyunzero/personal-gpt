import { persistChatTurn } from "@/lib/chat/chat-session.service";
import { formatMessages, type InputMessage } from "@/lib/chat/messages";
import type { ChatSessionEntity } from "@/lib/db/entities/chat-session.entity";
import { logger } from "@/lib/logger";

const PERSIST_TIMEOUT_MS = 5_000;

export interface AgentStreamPersistOptions {
  session: ChatSessionEntity;
  userContent: string;
  upstreamStatus: number;
  onPersisted?: () => void;
}

/** Last user turn text from agent chat body messages (UIMessage or legacy content). */
export function extractLastUserContentFromMessages(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  const formatted = formatMessages(messages as InputMessage[]);
  for (let i = formatted.length - 1; i >= 0; i--) {
    const msg = formatted[i]!;
    if (msg.role === "user" && msg.content) return msg.content;
  }
  return "";
}

function parseSseDataLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trimStart();
  if (payload === "[DONE]") return null;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

function extractTextDelta(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return "";
  const obj = chunk as { type?: string; delta?: string; text?: string };
  if (obj.type !== "text-delta") return "";
  if (typeof obj.delta === "string") return obj.delta;
  if (typeof obj.text === "string") return obj.text;
  return "";
}

function processSseLine(line: string, assistantText: { value: string }): void {
  const chunk = parseSseDataLine(line);
  if (chunk) assistantText.value += extractTextDelta(chunk);
}

/**
 * Tap upstream agent SSE: pass bytes through, accumulate text-delta, persist on close (D-23).
 * Fail-open on persist errors — stream delivery is never blocked.
 */
export function tapAgentStreamForPersistence(
  upstream: ReadableStream<Uint8Array>,
  opts: AgentStreamPersistOptions,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = "";
  const assistantText = { value: "" };
  const log = logger.child({ scope: "agent-stream-persist" });

  const flushPersist = async () => {
    const ok = opts.upstreamStatus >= 200 && opts.upstreamStatus < 300;
    if (!ok || !assistantText.value.trim() || !opts.userContent.trim()) return;
    try {
      await Promise.race([
        persistChatTurn({
          session: opts.session,
          userContent: opts.userContent,
          assistantContent: assistantText.value,
        }),
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, PERSIST_TIMEOUT_MS);
          timer.unref?.();
        }),
      ]);
      opts.onPersisted?.();
    } catch (err) {
      log.warn("persistChatTurn failed (ignored)", { err });
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (lineBuffer) processSseLine(lineBuffer, assistantText);
          lineBuffer = "";
          await flushPersist();
          controller.close();
          return;
        }
        if (value) {
          controller.enqueue(value);
          lineBuffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = lineBuffer.indexOf("\n")) !== -1) {
            const line = lineBuffer.slice(0, nl);
            lineBuffer = lineBuffer.slice(nl + 1);
            processSseLine(line, assistantText);
          }
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
}
