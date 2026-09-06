import Link from "next/link";

import ModeSegmentedControl, { type ChatMode } from "./ModeSegmentedControl";

/** 品牌星标（消息头像等复用） */
export const SpikeMark = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2 L13 11 L22 12 L13 13 L12 22 L11 13 L2 12 L11 11 Z" />
  </svg>
);

type AppHeaderProps = {
  activePage: "chat" | "kb";
  mode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  modeDisabled?: boolean;
  onNewThread?: () => void;
};

/**
 * 主区顶栏：Chat|Agent + 知识库 / 新会话（品牌在侧栏）。
 */
export default function AppHeader({
  activePage,
  mode,
  onModeChange,
  modeDisabled = false,
  onNewThread,
}: AppHeaderProps) {
  return (
    <header className="chat-header">
      <div className="chat-header-inner app-header-inner">
        {activePage === "chat" && mode && onModeChange ? (
          <ModeSegmentedControl mode={mode} onChange={onModeChange} disabled={modeDisabled} />
        ) : (
          <span className="chat-header-page-title">{activePage === "kb" ? "知识库" : "对话"}</span>
        )}

        <div className="app-header-cluster">
          <nav className="app-header-nav" aria-label="快捷操作">
            {activePage === "chat" ? (
              <Link href="/kb" className="app-header-link accent">
                知识库
              </Link>
            ) : (
              <Link href="/" className="app-header-link accent">
                对话
              </Link>
            )}
            {onNewThread ? (
              <button
                type="button"
                className="app-header-link ghost"
                disabled={modeDisabled}
                onClick={onNewThread}
              >
                新会话
              </button>
            ) : null}
          </nav>
        </div>
      </div>
    </header>
  );
}
