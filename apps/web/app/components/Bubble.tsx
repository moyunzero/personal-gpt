import { UIMessage } from "@ai-sdk/react";
import type { Citation } from "@personal-gpt/shared/types/kb";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import AgentStepPanels, { extractAgentSteps } from "./AgentStepPanels";
import AgentTodoList, { extractTodos } from "./AgentTodoList";
import AgentTracePanel, { extractAgentTrace } from "./AgentTracePanel";
import CitationCards from "./CitationCards";

interface BubbleProps {
  message: UIMessage;
  /** 当前消息仍在流式输出时不展示引用区（D-07） */
  isStreaming?: boolean;
  /** Agent 模式：展示待办 / 步骤；角色行「助手 · Agent」 */
  agentMode?: boolean;
  /** 本轮流式失败：步骤 active → 失败展示 */
  streamFailed?: boolean;
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

const Bubble = ({
  message,
  isStreaming = false,
  agentMode = false,
  streamFailed = false,
}: BubbleProps) => {
  const content = message.parts
    .filter((part) => "type" in part && part.type === "text" && "text" in part)
    .map((part) => ("text" in part ? (part.text as string) : ""))
    .join("");

  const { role } = message;
  const citations = role === "assistant" && !isStreaming ? extractCitations(message) : [];
  const showTrace =
    agentMode && role === "assistant" && !isStreaming && Boolean(extractAgentTrace(message));
  const hasAgentChrome =
    agentMode &&
    role === "assistant" &&
    (extractTodos(message).length > 0 ||
      extractAgentSteps(message).length > 0 ||
      showTrace);

  if (!content && !hasAgentChrome) {
    return null;
  }

  if (role === "assistant") {
    return (
      <div className="message message-assistant">
        <AssistantAvatar />
        <div className="message-body">
          {agentMode ? (
            <p className="message-role-line">助手 · Agent</p>
          ) : null}
          {agentMode ? (
            <>
              <AgentTodoList message={message} />
              <AgentStepPanels
                message={message}
                markActiveAsError={streamFailed && !isStreaming}
              />
            </>
          ) : null}
          {content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          ) : null}
          {citations.length > 0 ? <CitationCards citations={citations} /> : null}
          {showTrace ? <AgentTracePanel message={message} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="message message-user">
      <div className="message-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
};

export default Bubble;
