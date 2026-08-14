"use client";

export type ClassifiedAgentError = {
  code: string;
  title: string;
  advice: string;
  retryLabel: string;
  raw: string;
};

/** 把 transport / SSE 原始错误翻成人话（设计稿 D） */
export function classifyAgentError(rawInput: unknown): ClassifiedAgentError {
  const raw =
    rawInput instanceof Error
      ? rawInput.message
      : typeof rawInput === "string"
        ? rawInput
        : String(rawInput ?? "未知错误");
  const text = raw.trim() || "未知错误";
  const lower = text.toLowerCase();

  if (
    /\b401\b/.test(text) ||
    /unauthorized|未授权|鉴权失败|invalid.*token|missing.*token/i.test(text)
  ) {
    return {
      code: "401",
      title: "身份校验未通过",
      advice:
        "Agent 服务返回了未授权（401）。常见原因：内部令牌缺失或无效。可直接重试；切换到 Chat 会进入另一套会话历史。",
      retryLabel: "重试本任务",
      raw: text,
    };
  }

  if (/\b403\b/.test(text) || /forbidden|permission denied|无权限|禁止访问/i.test(text)) {
    return {
      code: "403",
      title: "服务拒绝了这次请求",
      advice:
        "Agent 服务返回了禁止访问（403）。常见原因：模型无权，或网关拦截。可直接重试；切换到 Chat 会进入另一套会话历史。",
      retryLabel: "重试本任务",
      raw: text,
    };
  }

  if (/\b429\b/.test(text) || /rate[_ ]?limit|too many requests|请求过于频繁/i.test(text)) {
    return {
      code: "429",
      title: "请求太频繁，被限流了",
      advice: "稍等片刻再试。复杂任务消耗较大，也可缩短问题或拆成两步后重试。",
      retryLabel: "稍后再试",
      raw: text,
    };
  }

  if (
    /failed to fetch|networkerror|econnrefused|enotfound|network|连不上|fetch failed/i.test(lower)
  ) {
    return {
      code: "NETWORK",
      title: "连不上 Agent 服务",
      advice:
        "请确认本机 agent-service（:3002）与 web（:3000）已启动；Agent 经 `/api/agent/chat` BFF 转发。也可检查 AGENT_SERVICE_URL。",
      retryLabel: "重试连接",
      raw: text,
    };
  }

  if (/model_not_found|model.*does not exist|tool call validation|tool.*schema/i.test(text)) {
    return {
      code: "MODEL",
      title: "模型或工具调用失败",
      advice: "当前模型不可用，或专科交接参数不合规。可更换模型/提供商后重试，或改回 Chat。",
      retryLabel: "重试本任务",
      raw: text,
    };
  }

  if (/\b5\d{2}\b/.test(text) || /internal server|服务异常/i.test(text)) {
    return {
      code: "5xx",
      title: "服务暂时出了问题",
      advice: "多半是临时故障。可稍后重试；若反复出现，请查看 agent-service 日志。",
      retryLabel: "重试本任务",
      raw: text,
    };
  }

  return {
    code: "ERROR",
    title: "这次任务没有完成",
    advice: "执行中途出错。可重试本任务，或改回 Chat 换种方式提问。",
    retryLabel: "重试本任务",
    raw: text,
  };
}

type AgentErrorCardProps = {
  error: unknown;
  onRetry: () => void;
  onSwitchToChat: () => void;
  retryDisabled?: boolean;
};

export default function AgentErrorCard({
  error,
  onRetry,
  onSwitchToChat,
  retryDisabled = false,
}: AgentErrorCardProps) {
  const info = classifyAgentError(error);

  return (
    <article className="agent-error-card" role="alert" aria-live="assertive">
      <div className="agent-error-card-head">
        <p className="agent-error-kicker">任务中断 · {info.code}</p>
        <h2 className="agent-error-title">{info.title}</h2>
        <p className="agent-error-body">{info.advice}</p>
      </div>
      <div className="agent-error-actions">
        <button
          type="button"
          className="agent-error-btn agent-error-btn-primary"
          onClick={onRetry}
          disabled={retryDisabled}
        >
          {info.retryLabel}
        </button>
        <button
          type="button"
          className="agent-error-btn agent-error-btn-ghost"
          onClick={onSwitchToChat}
          disabled={retryDisabled}
        >
          改回 Chat
        </button>
      </div>
      <details className="agent-error-tech">
        <summary>技术细节（供排查）</summary>
        <pre>{info.raw}</pre>
      </details>
    </article>
  );
}
