"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "./components/AppHeader";
import AppShell from "./components/AppShell";
import AgentErrorCard from "./components/AgentErrorCard";
import Bubble from "./components/Bubble";
import ChatErrorCard from "./components/ChatErrorCard";
import type { ChatSessionRow } from "./components/ChatSidebar";
import CorpusToggle, { type CorpusChoice } from "./components/CorpusToggle";
import type { ChatMode } from "./components/ModeSegmentedControl";
import PromptSuggestionsRow from "./components/PromptSuggestionsRow";
import LoadingBubble from "./components/LoadingBubble";
import {
  getOrCreateThreadId,
  rotateThreadId,
  setThreadId,
} from "@/lib/chat/thread-id";
import {
  mapPersistedMessages,
  sessionCacheKey,
  type UiChatMessage,
} from "@/lib/chat/session-messages";
import { getOrCreateUserKey } from "@/lib/chat/user-key";

function lastUserTextFromMessages(messages: { role?: string; parts?: unknown[] }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user" || !Array.isArray(m.parts)) continue;
    const text = m.parts
      .filter(
        (p): p is { type: string; text: string } =>
          typeof p === "object" &&
          p !== null &&
          "type" in p &&
          (p as { type: string }).type === "text" &&
          "text" in p &&
          typeof (p as { text: unknown }).text === "string",
      )
      .map((p) => p.text)
      .join("");
    if (text.trim()) return text;
  }
  return "";
}

export default function Home() {
  const [mode, setMode] = useState<ChatMode>("chat");
  const [corpus, setCorpus] = useState<CorpusChoice>("user");
  const [input, setInput] = useState("");
  const [userKey] = useState(() => (typeof window !== "undefined" ? getOrCreateUserKey() : ""));
  const [threadRevision, setThreadRevision] = useState(0);
  const [sessionsRevision, setSessionsRevision] = useState(0);
  const threadId = useMemo(() => {
    if (typeof window === "undefined") return "";
    void threadRevision;
    return getOrCreateThreadId(mode);
  }, [mode, threadRevision]);
  const chatKey = sessionCacheKey(mode, threadId);
  const streamRef = useRef<HTMLElement>(null);
  const messagesCacheRef = useRef<Record<string, UiChatMessage[]>>({});
  const skipHistoryLoadRef = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: mode === "agent" ? "/api/agent/chat" : "/api/chat",
        body: {
          corpus,
          ...(userKey ? { userKey } : {}),
          ...(threadId ? { thread_id: threadId } : {}),
        },
      }),
    [mode, corpus, userKey, threadId],
  );

  const { messages, sendMessage, regenerate, status, error, clearError, setMessages } = useChat({
    id: `home-${mode}`,
    transport,
  });

  const noMessages = messages.length === 0;
  const isLoading = status === "submitted" || status === "streaming";
  const showErrorCard = Boolean(error) && !isLoading;
  const showAgentErrorCard = showErrorCard && mode === "agent";
  const showChatError = showErrorCard && mode === "chat";

  useEffect(() => {
    const el = streamRef.current;
    if (!el || noMessages) return;
    // 用户上翻阅读时不要强行拉回底部
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 96) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, noMessages, status, showErrorCard]);

  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading) {
      setSessionsRevision((n) => n + 1);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    if (!threadId) return;
    if (skipHistoryLoadRef.current) {
      skipHistoryLoadRef.current = false;
      return;
    }

    const cached = messagesCacheRef.current[chatKey];
    if (cached?.length) {
      setMessages(cached);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const listRes = await fetch("/api/chat/sessions");
        if (!listRes.ok) throw new Error("sessions list failed");
        const listData = (await listRes.json()) as { sessions?: ChatSessionRow[] };
        const session = listData.sessions?.find(
          (s) => s.threadId === threadId && s.mode === mode,
        );
        if (!session) {
          if (!cancelled) setMessages([]);
          return;
        }
        const msgRes = await fetch(
          `/api/chat/sessions?id=${encodeURIComponent(session.id)}&messages=1`,
        );
        if (!msgRes.ok) throw new Error("session messages failed");
        const data = (await msgRes.json()) as {
          messages?: { id: string; role: string; content: string }[];
        };
        const loaded = mapPersistedMessages(data.messages ?? []);
        if (!cancelled) {
          messagesCacheRef.current[chatKey] = loaded;
          setMessages(loaded);
        }
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatKey, threadId, mode, setMessages]);

  useEffect(() => {
    if (!threadId || messages.length === 0) return;
    messagesCacheRef.current[chatKey] = messages as UiChatMessage[];
  }, [messages, chatKey, threadId]);

  const handlePrompt = async (promptText: string) => {
    clearError();
    await sendMessage({ text: promptText });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    clearError();
    await sendMessage({ text: input });
    setInput("");
  };

  const handleRetry = async () => {
    const text = lastUserTextFromMessages(messages);
    if (!text.trim()) return;
    clearError();
    await regenerate();
  };

  const handleSwitchToChat = () => {
    clearError();
    setMode("chat");
  };

  const handleNewThread = () => {
    clearError();
    if (threadId && messages.length > 0) {
      messagesCacheRef.current[chatKey] = messages as UiChatMessage[];
    }
    skipHistoryLoadRef.current = true;
    rotateThreadId(mode);
    setThreadRevision((n) => n + 1);
    setMessages([]);
    setInput("");
    setSessionsRevision((n) => n + 1);
  };

  const handleSelectSession = (session: ChatSessionRow) => {
    if (session.threadId === threadId && session.mode === mode) return;
    clearError();
    if (threadId && messages.length > 0) {
      messagesCacheRef.current[chatKey] = messages as UiChatMessage[];
    }
    const nextMode = session.mode === "agent" ? "agent" : "chat";
    const nextKey = sessionCacheKey(nextMode, session.threadId);
    const cached = messagesCacheRef.current[nextKey];
    setMode(nextMode);
    setThreadId(nextMode, session.threadId);
    setThreadRevision((n) => n + 1);
    setInput("");
    if (cached?.length) {
      setMessages(cached);
    } else {
      setMessages([]);
    }
  };

  const handleDeleteSession = (session: ChatSessionRow) => {
    const key = sessionCacheKey(
      session.mode === "agent" ? "agent" : "chat",
      session.threadId,
    );
    delete messagesCacheRef.current[key];
    if (session.threadId !== threadId) return;
    clearError();
    skipHistoryLoadRef.current = true;
    rotateThreadId(mode);
    setThreadRevision((n) => n + 1);
    setMessages([]);
    setInput("");
  };

  return (
    <AppShell
      activePage="chat"
      mode={mode}
      onModeChange={setMode}
      modeDisabled={isLoading}
      onNewThread={handleNewThread}
      activeThreadId={threadId}
      onSelectSession={(s) => void handleSelectSession(s)}
      onDeleteSession={handleDeleteSession}
      sessionsRevision={sessionsRevision}
    >
      <main>
        <AppHeader
          activePage="chat"
          mode={mode}
          onModeChange={setMode}
          modeDisabled={isLoading}
          onNewThread={handleNewThread}
        />

        <section ref={streamRef} className="chat-stream">
          <div className="chat-stream-inner">
            {noMessages ? (
              <div className="empty-state">
                <h1 className="starter-headline">做个树洞吧</h1>
                <p className="starter-sub">
                  也可以了解我的经历与作品。选一个话题开始，或者直接告诉我你最近在想什么。
                </p>
                <PromptSuggestionsRow onPromptClick={handlePrompt} />
              </div>
            ) : (
              <div className="messages-container">
                {messages.map((message, index) => (
                  <Bubble
                    key={message.id || `message-${index}`}
                    message={message}
                    agentMode={mode === "agent"}
                    streamFailed={
                      showAgentErrorCard &&
                      index === messages.length - 1 &&
                      message.role === "assistant"
                    }
                    isStreaming={
                      isLoading && index === messages.length - 1 && message.role === "assistant"
                    }
                  />
                ))}
                {isLoading && <LoadingBubble />}
                {showAgentErrorCard ? (
                  <div className="message message-assistant">
                    <span className="assistant-avatar" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2 L13 11 L22 12 L13 13 L12 22 L11 13 L2 12 L11 11 Z" />
                      </svg>
                    </span>
                    <div className="message-body">
                      <AgentErrorCard
                        error={error}
                        onRetry={() => void handleRetry()}
                        onSwitchToChat={handleSwitchToChat}
                        retryDisabled={isLoading}
                      />
                    </div>
                  </div>
                ) : null}
                {showChatError ? (
                  <div className="message message-assistant">
                    <span className="assistant-avatar" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2 L13 11 L22 12 L13 13 L12 22 L11 13 L2 12 L11 11 Z" />
                      </svg>
                    </span>
                    <div className="message-body">
                      <ChatErrorCard
                        error={error}
                        onRetry={() => void handleRetry()}
                        retryDisabled={isLoading}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="composer">
          <div className="composer-inner">
            <div className="composer-toolbar">
              <span className="composer-corpus-hint">
                当前：{corpus === "seed" ? "种子库检索" : "用户库检索"}
              </span>
              <CorpusToggle value={corpus} onChange={setCorpus} disabled={isLoading} />
            </div>
            <div className="composer-shell">
              <input
                className="composer-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={mode === "agent" ? "描述复杂任务，例如调研并生成报告…" : "想问点啥呢～"}
                disabled={isLoading}
                aria-label="输入消息"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="composer-send"
                aria-label="发送"
              >
                {isLoading ? (
                  <svg className="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray="40"
                      strokeDashoffset="10"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 19V5M5 12l7-7 7 7"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
            <p className="composer-hint">
              {showErrorCard
                ? mode === "agent"
                  ? "Agent 模式 · 出错时可在上方卡片重试"
                  : "出错时可在上方卡片重试，或换个问法"
                : mode === "agent"
                  ? "Agent 模式 · 复杂任务走多 Agent · 闲聊会短路回复"
                  : "按 Enter 发送 · 内容可能不准确，仅供参考"}
            </p>
          </div>
        </form>
      </main>
    </AppShell>
  );
}
