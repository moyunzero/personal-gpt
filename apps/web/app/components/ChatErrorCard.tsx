"use client";

type ChatErrorCardProps = {
  error: unknown;
  onRetry: () => void;
  retryDisabled?: boolean;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error ?? "请求失败");
}

/** Chat 模式错误卡：对齐 agent-error-card 视觉，动作更克制。 */
export default function ChatErrorCard({
  error,
  onRetry,
  retryDisabled = false,
}: ChatErrorCardProps) {
  const raw = errorMessage(error);

  return (
    <article className="chat-error-card" role="alert" aria-live="assertive">
      <div className="chat-error-card-head">
        <p className="chat-error-kicker">回复中断</p>
        <h2 className="chat-error-title">这次没能答上来</h2>
        <p className="chat-error-body">可以点下面重试，或换个问法再发一条。</p>
      </div>
      <div className="chat-error-actions">
        <button
          type="button"
          className="chat-error-btn chat-error-btn-primary"
          onClick={onRetry}
          disabled={retryDisabled}
        >
          重试
        </button>
      </div>
      <details className="chat-error-tech">
        <summary>技术细节</summary>
        <pre>{raw}</pre>
      </details>
    </article>
  );
}
