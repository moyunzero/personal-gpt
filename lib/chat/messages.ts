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
 * 把任意 role 字符串收敛到 ChatRole；未识别的角色一律降级成 user
 * （比 throw 友好，且能避免 tool / function 等中间态泄漏到 LLM 输入）。
 */
function normalizeRole(role: string): ChatRole {
  if (role === "system" || role === "assistant") return role;
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
