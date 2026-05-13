import { UIMessage } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface BubbleProps {
  message: UIMessage;
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

const Bubble = ({ message }: BubbleProps) => {
  // 从 AI SDK 5+ 的 parts 数组中提取文本内容
  const content = message.parts
    .filter(
      (part) => "type" in part && part.type === "text" && "text" in part,
    )
    .map((part) => ("text" in part ? (part.text as string) : ""))
    .join("");

  const { role } = message;

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
