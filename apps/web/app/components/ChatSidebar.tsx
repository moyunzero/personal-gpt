"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type MouseEvent } from "react";

import WorkspaceSwitcher from "@/components/workspace-switcher";
import KbDeleteConfirm from "./KbDeleteConfirm";
import type { ChatMode } from "./ModeSegmentedControl";

export type ChatSessionRow = {
  id: string;
  threadId: string;
  mode: ChatMode;
  title: string | null;
  updatedAt: string;
};

type ChatSidebarProps = {
  activePage: "chat" | "kb";
  mode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  modeDisabled?: boolean;
  onNewThread?: () => void;
  activeThreadId?: string;
  onSelectSession?: (session: ChatSessionRow) => void;
  onDeleteSession?: (session: ChatSessionRow) => void;
  /** 变更时重新拉取会话列表 */
  sessionsRevision?: number;
};

export default function ChatSidebar({
  activePage,
  mode = "chat",
  onModeChange,
  modeDisabled = false,
  onNewThread,
  activeThreadId,
  onSelectSession,
  onDeleteSession,
  sessionsRevision = 0,
}: ChatSidebarProps) {
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [pendingDelete, setPendingDelete] = useState<ChatSessionRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/sessions");
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: ChatSessionRow[] };
      if (data.sessions) setSessions(data.sessions);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Mount / revision: refetch session list from API (external store).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch→setState
    void refresh();
  }, [refresh, sessionsRevision]);

  const askDelete = (session: ChatSessionRow, e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (modeDisabled || deleting) return;
    setPendingDelete(session);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    const session = pendingDelete;
    setDeleting(true);
    try {
      const res = await fetch(`/api/chat/sessions?id=${encodeURIComponent(session.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setPendingDelete(null);
      onDeleteSession?.(session);
    } finally {
      setDeleting(false);
    }
  };

  const pendingLabel = pendingDelete?.title?.trim() || "未命名会话";

  return (
    <aside className="chat-sidebar" aria-label="主导航">
      <div className="chat-sidebar-brand">
        <div className="chat-brand-mark" aria-hidden="true" />
        <div className="chat-brand-text">
          <span className="chat-brand-name">Personal</span>
          <span className="chat-brand-sub">Emotion GPT</span>
        </div>
      </div>

      {onNewThread ? (
        <button
          type="button"
          className="chat-sidebar-new"
          disabled={modeDisabled}
          onClick={onNewThread}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          新会话
        </button>
      ) : null}

      <div className="chat-sidebar-nav">
        <div className="chat-sidebar-label">空间</div>
        {activePage === "chat" && onModeChange ? (
          <>
            <button
              type="button"
              className={`chat-sidebar-item${mode === "chat" ? " active" : ""}`}
              disabled={modeDisabled}
              onClick={() => onModeChange("chat")}
            >
              对话
            </button>
            <button
              type="button"
              className={`chat-sidebar-item${mode === "agent" ? " active" : ""}`}
              disabled={modeDisabled}
              onClick={() => onModeChange("agent")}
            >
              Agent
            </button>
          </>
        ) : (
          <Link href="/" className="chat-sidebar-item">
            对话
          </Link>
        )}
        <Link href="/kb" className={`chat-sidebar-item${activePage === "kb" ? " active" : ""}`}>
          知识库
        </Link>
      </div>

      {activePage === "chat" ? (
        <>
          <div className="chat-sidebar-label chat-sidebar-label-pad">最近</div>
          <div className="chat-sidebar-threads">
            {sessions.length === 0 ? (
              <p className="chat-sidebar-empty">还没有会话</p>
            ) : (
              sessions.map((s) => {
                const active = s.threadId === activeThreadId;
                return (
                  <div key={s.id} className={`chat-sidebar-thread-row${active ? " active" : ""}`}>
                    <button
                      type="button"
                      className="chat-sidebar-thread"
                      disabled={modeDisabled}
                      onClick={() => onSelectSession?.(s)}
                      title={s.title ?? s.threadId}
                    >
                      {s.title?.trim() || "未命名会话"}
                    </button>
                    <button
                      type="button"
                      className="chat-sidebar-thread-delete"
                      disabled={modeDisabled || deleting}
                      aria-label={`删除会话 ${s.title?.trim() || "未命名"}`}
                      title="删除"
                      onClick={(e) => askDelete(s, e)}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 7h14M10 11v6M14 11v6M9 7V5h6v2M7 7l1 12h8l1-12"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="chat-sidebar-threads" />
      )}

      <div className="chat-sidebar-foot">
        <WorkspaceSwitcher variant="sidebar" />
      </div>

      <KbDeleteConfirm
        open={Boolean(pendingDelete)}
        title={pendingLabel}
        heading="确认删除会话？"
        body={
          <p>
            将永久删除「<strong>{pendingLabel}</strong>」及其中的聊天记录。此操作不可撤销。
          </p>
        }
        onCancel={() => {
          if (!deleting) setPendingDelete(null);
        }}
        onConfirm={() => void confirmDelete()}
        loading={deleting}
      />
    </aside>
  );
}
