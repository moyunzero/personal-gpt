/**
 * 把 useChat 发来的消息（含 parts 数组的 UIMessage 或带 content 的旧格式）
 * 归一化成 OpenAI / Vercel AI SDK 期望的 `{ role, content }` 形式。
 *
 * 单一职责：只做格式归一，不做长度校验、不做角色映射。
 */

export interface MessagePart {
  type: string;
  text: string;
}

/** 后端只识别这三种 role，其他全部归到 user。 */
export type ChatRole = "system" | "user" | "assistant";

export interface InputMessage {
  role: string;
  parts?: MessagePart[];
  content?: string;
}

export interface FormattedMessage {
  role: ChatRole;
  content: string;
}

/**
 * 把任意 role 字符串收敛到 ChatRole。
 *
 * 安全策略：
 *   - 只放行 `assistant`（保留多轮上下文必要）。
 *   - 客户端传入的 `system` **不放行**，防止 prompt 注入：服务端的系统
 *     指令由 `buildSystemPrompt` 在 route.ts 中独立生成，绝不从外部透传。
 *   - 其他角色（tool / function / 自造的字符串等）一律降级为 `user`。
 */
function normalizeRole(role: string): ChatRole {
  if (role === "assistant") return "assistant";
  return "user";
}

/**
 * 兼容两种入参：
 * 1. UIMessage（`parts: [{ type:"text", text:"..." }, ...]`）
 * 2. 老的 `{ role, content }`
 *
 * 非 text 类型的 part（image / tool-call 等）会被丢弃 —— 当前后端只处理文本。
 */
export function formatMessages(messages: InputMessage[]): FormattedMessage[] {
  return messages.map((msg) => {
    let content = "";

    if (msg.parts && Array.isArray(msg.parts)) {
      content = msg.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
    } else if (msg.content) {
      content = msg.content;
    }

    return {
      role: normalizeRole(msg.role),
      content: content.trim(),
    };
  });
}
