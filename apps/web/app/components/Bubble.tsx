import { UIMessage } from "@ai-sdk/react";
import type { Citation } from "@personal-gpt/shared/types/kb";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import CitationCards from "./CitationCards";

interface BubbleProps {
  message: UIMessage;
  /** 当前消息仍在流式输出时不展示引用区（D-07） */
  isStreaming?: boolean;
}

function extractCitations(message: UIMessage): Citation[] {
  for (const part of message.parts) {
    if (
      "type" in part &&
      part.type === "data-citations" &&
      "data" in part &&
      part.data &&
      typeof part.data === "object" &&
      "citations" in part.data &&
      Array.isArray((part.data as { citations: unknown }).citations)
    ) {
      return (part.data as { citations: Citation[] }).citations;
    }
  }
  return [];
}

/**
 * Anthropic 风格 spike-mark（与 page.tsx 同款），作为助手消息头像。
 * 用 surface-card 圆角方框包裹，呼应 DESIGN.md 中的品牌 wordmark 前缀。
 */
const AssistantAvatar = () => (
  <span className="assistant-avatar" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2 L13 11 L22 12 L13 13 L12 22 L11 13 L2 12 L11 11 Z" />
    </svg>
  </span>
);

const Bubble = ({ message, isStreaming = false }: BubbleProps) => {
  // 从 AI SDK 5+ 的 parts 数组中提取文本内容
  const content = message.parts
    .filter((part) => "type" in part && part.type === "text" && "text" in part)
    .map((part) => ("text" in part ? (part.text as string) : ""))
    .join("");

  const { role } = message;
  const citations = role === "assistant" && !isStreaming ? extractCitations(message) : [];

  if (!content) {
    return null;
  }

  // 助手：左对齐 + spike-mark 头像 + 段落文字（不包气泡）
  if (role === "assistant") {
    return (
      <div className="message message-assistant">
        <AssistantAvatar />
        <div className="message-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          {citations.length > 0 ? <CitationCards citations={citations} /> : null}
        </div>
      </div>
    );
  }

  // 用户：右对齐 cream-strong 气泡
  return (
    <div className="message message-user">
      <div className="message-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
};

export default Bubble;
