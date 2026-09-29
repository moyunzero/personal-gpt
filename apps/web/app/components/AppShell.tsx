"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import ChatSidebar, { type ChatSessionRow } from "./ChatSidebar";
import type { ChatMode } from "./ModeSegmentedControl";

type SidebarDrawerContextValue = {
  open: boolean;
  toggle: () => void;
  close: () => void;
};

const SidebarDrawerContext = createContext<SidebarDrawerContextValue | null>(null);

/** Mobile drawer open/toggle — consumed by AppHeader hamburger (D-18). */
export function useSidebarDrawer(): SidebarDrawerContextValue | null {
  return useContext(SidebarDrawerContext);
}

type AppShellProps = {
  children: ReactNode;
  activePage: "chat" | "kb" | "settings";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggle = useCallback(() => setSidebarOpen((v) => !v), []);
  const close = useCallback(() => setSidebarOpen(false), []);

  const handleSelectSession = useCallback(
    (session: ChatSessionRow) => {
      close();
      onSelectSession?.(session);
    },
    [close, onSelectSession],
  );

  return (
    <SidebarDrawerContext.Provider value={{ open: sidebarOpen, toggle, close }}>
      <div
        className={`app-shell${sidebarOpen ? " sidebar-open" : ""}`}
        data-sidebar-open={sidebarOpen ? "true" : undefined}
      >
        <ChatSidebar
          activePage={activePage}
          mode={mode}
          onModeChange={onModeChange}
          modeDisabled={modeDisabled}
          onNewThread={onNewThread}
          activeThreadId={activeThreadId}
          onSelectSession={onSelectSession ? handleSelectSession : undefined}
          onDeleteSession={onDeleteSession}
          sessionsRevision={sessionsRevision}
        />
        {sidebarOpen ? (
          <button
            type="button"
            className="sidebar-drawer-backdrop"
            aria-label="关闭侧栏"
            onClick={close}
          />
        ) : null}
        <div className="app-main">{children}</div>
      </div>
    </SidebarDrawerContext.Provider>
  );
}
