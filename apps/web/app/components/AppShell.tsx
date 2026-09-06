"use client";

import type { ReactNode } from "react";

import ChatSidebar, { type ChatSessionRow } from "./ChatSidebar";
import type { ChatMode } from "./ModeSegmentedControl";

type AppShellProps = {
  children: ReactNode;
  activePage: "chat" | "kb";
  mode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  modeDisabled?: boolean;
  onNewThread?: () => void;
  activeThreadId?: string;
  onSelectSession?: (session: ChatSessionRow) => void;
  onDeleteSession?: (session: ChatSessionRow) => void;
  sessionsRevision?: number;
};

/** 左侧栏 + 主区壳层（对齐 design/chat-ui-mock-v1）。 */
export default function AppShell({
  children,
  activePage,
  mode,
  onModeChange,
  modeDisabled,
  onNewThread,
  activeThreadId,
  onSelectSession,
  onDeleteSession,
  sessionsRevision,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <ChatSidebar
        activePage={activePage}
        mode={mode}
        onModeChange={onModeChange}
        modeDisabled={modeDisabled}
        onNewThread={onNewThread}
        activeThreadId={activeThreadId}
        onSelectSession={onSelectSession}
        onDeleteSession={onDeleteSession}
        sessionsRevision={sessionsRevision}
      />
      <div className="app-main">{children}</div>
    </div>
  );
}
