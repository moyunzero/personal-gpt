import Link from "next/link";

/** Anthropic 风格 spike-mark（与 chat 页一致） */
export const SpikeMark = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2 L13 11 L22 12 L13 13 L12 22 L11 13 L2 12 L11 11 Z" />
  </svg>
);

type AppHeaderProps = {
  /** 当前激活页，用于高亮导航（D-01/D-02） */
  activePage: "chat" | "kb";
};

/**
 * 共享顶栏：左侧 spike-mark + wordmark，右侧「知识库」/「对话」切换（D-18）。
 */
export default function AppHeader({ activePage }: AppHeaderProps) {
  return (
    <header className="chat-header">
      <div className="chat-header-inner app-header-inner">
        <Link href="/" className="app-header-brand">
          <SpikeMark className="spike-mark" />
          <span className="wordmark">Personal · Emotion GPT</span>
        </Link>

        <nav className="app-header-nav" aria-label="主导航">
          {activePage === "chat" ? (
            <Link href="/kb" className="app-header-link">
              知识库
            </Link>
          ) : (
            <Link href="/" className="app-header-link">
              对话
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
