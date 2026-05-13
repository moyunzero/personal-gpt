/**
 * 助手回复加载中的占位气泡。
 * 与 Bubble.tsx 的 assistant 形态保持一致（左侧 spike-mark + 内容区），
 * 内容区显示三点跳动动画，体现"Claude 正在思考"。
 */
const LoadingBubble = () => {
  return (
    <div className="message message-assistant" aria-live="polite" aria-busy="true">
      <span className="assistant-avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2 L13 11 L22 12 L13 13 L12 22 L11 13 L2 12 L11 11 Z" />
        </svg>
      </span>
      <div className="message-body">
        <span className="loading-dots" aria-label="正在生成回复">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
};

export default LoadingBubble;
