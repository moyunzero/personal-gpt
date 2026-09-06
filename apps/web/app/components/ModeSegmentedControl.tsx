/**
 * Chat | Agent 分段控件（方案 A / UI-SPEC）。
 */
export type ChatMode = "chat" | "agent";

type ModeSegmentedControlProps = {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
};

export default function ModeSegmentedControl({
  mode,
  onChange,
  disabled = false,
}: ModeSegmentedControlProps) {
  return (
    <div className="mode-seg" role="group" aria-label="对话模式">
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
  );
}
