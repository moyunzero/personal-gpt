"use client";

import Link from "next/link";

import ModeSegmentedControl, { type ChatMode } from "./ModeSegmentedControl";
import { useSidebarDrawer } from "./AppShell";

type AppHeaderProps = {
  activePage: "chat" | "kb";
  mode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  modeDisabled?: boolean;
  onNewThread?: () => void;
  /** null=加载中；true=已登录；false=游客 */
  isAuthenticated?: boolean | null;
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
  isAuthenticated = null,
}: AppHeaderProps) {
  const drawer = useSidebarDrawer();

  return (
    <header className="chat-header">
      <div className="chat-header-inner app-header-inner">
        <div className="app-header-leading">
          {drawer ? (
            <button
              type="button"
              className="app-header-hamburger"
              aria-label="打开菜单"
              aria-expanded={drawer.open}
              onClick={drawer.toggle}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
          {activePage === "chat" && mode && onModeChange ? (
            <ModeSegmentedControl mode={mode} onChange={onModeChange} disabled={modeDisabled} />
          ) : (
            <span className="chat-header-page-title">{activePage === "kb" ? "知识库" : "对话"}</span>
          )}
        </div>

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
            {isAuthenticated === false ? (
              <Link href="/api/auth/signin" className="app-header-link accent">
                登录
              </Link>
            ) : null}
            {isAuthenticated === true ? (
              <Link href="/api/auth/signout" className="app-header-link ghost">
                退出
              </Link>
            ) : null}
          </nav>
        </div>
      </div>
    </header>
  );
}
