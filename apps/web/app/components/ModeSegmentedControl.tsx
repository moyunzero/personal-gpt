"use client";

export type ChatMode = "chat" | "agent";

type ModeSegmentedControlProps = {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
  /** 新会话：旋转当前模式 thread_id（D-23） */
  onNewThread?: () => void;
};

/**
 * Chat | Agent 分段控件（方案 A / UI-SPEC）。
 */
export default function ModeSegmentedControl({
  mode,
  onChange,
  disabled = false,
  onNewThread,
}: ModeSegmentedControlProps) {
  return (
    <div className="mode-seg">
      <div role="group" aria-label="对话模式" className="mode-seg-group">
        <button
          type="button"
          className="mode-seg-btn"
          aria-pressed={mode === "chat"}
          disabled={disabled}
          onClick={() => onChange("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          className="mode-seg-btn"
          aria-pressed={mode === "agent"}
          disabled={disabled}
          onClick={() => onChange("agent")}
        >
          Agent
        </button>
      </div>
      {onNewThread ? (
        <div role="group" aria-label="会话操作" className="mode-seg-group">
          <button
            type="button"
            className="mode-seg-btn"
            disabled={disabled}
            onClick={onNewThread}
            title="新会话"
            aria-label="新会话"
          >
            新会话
          </button>
        </div>
      ) : null}
    </div>
  );
}
