"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "./components/AppHeader";
import AppShell from "./components/AppShell";
import AgentErrorCard from "./components/AgentErrorCard";
import Bubble from "./components/Bubble";
import ChatErrorCard from "./components/ChatErrorCard";
import type { ChatSessionRow } from "./components/ChatSidebar";
import CorpusToggle, { type CorpusChoice } from "./components/CorpusToggle";
import ModelChip from "./components/ModelChip";
import type { ChatMode } from "./components/ModeSegmentedControl";
import PromptSuggestionsRow from "./components/PromptSuggestionsRow";
import LoadingBubble from "./components/LoadingBubble";
import { buildHomeChatId } from "@/lib/chat/build-home-chat-id";
import { getOrCreateThreadId, rotateThreadId, setThreadId } from "@/lib/chat/thread-id";
import {
  mapPersistedMessages,
  sessionCacheKey,
  type UiChatMessage,
} from "@/lib/chat/session-messages";

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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
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
  const [savedModels, setSavedModels] = useState<{ id: string; modelId: string }[]>([]);
  const [chatModelId, setChatModelId] = useState("");
  const [agentModelId, setAgentModelId] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const applyGuestDefaults = () => {
        setCorpus("seed");
        setMode((m) => (m === "agent" ? "chat" : m));
      };
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          if (!cancelled) {
            setIsAuthenticated(false);
            applyGuestDefaults();
          }
          return;
        }
        const data = (await res.json()) as { user?: { id?: string } | null };
        if (!cancelled) {
          const authed = Boolean(data?.user?.id);
          setIsAuthenticated(authed);
          if (!authed) applyGuestDefaults();
        }
      } catch {
        if (!cancelled) {
          setIsAuthenticated(false);
          applyGuestDefaults();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated !== true) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/models");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        models?: { id: string; modelId: string }[];
        chatModelId?: string;
        agentModelId?: string;
      };
      if (cancelled) return;
      setSavedModels(data.models ?? []);
      setChatModelId(data.chatModelId ?? "");
      setAgentModelId(data.agentModelId ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const selectedModelId = mode === "agent" ? agentModelId : chatModelId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: mode === "agent" ? "/api/agent/chat" : "/api/chat",
        body: {
          corpus: isAuthenticated === false ? "seed" : corpus,
          // D-11: authenticated clients omit userKey; guests have no memory key
          ...(threadId ? { thread_id: threadId } : {}),
          ...(selectedModelId ? { model: selectedModelId } : {}),
        },
      }),
    [mode, corpus, threadId, isAuthenticated, selectedModelId],
  );

  const homeChatId = buildHomeChatId({
    mode,
    threadId,
    corpus,
    isAuthenticated,
    selectedModelId,
  });

  const { messages, sendMessage, regenerate, status, error, clearError, setMessages, stop } =
    useChat({
      id: homeChatId,
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
        const session = listData.sessions?.find((s) => s.threadId === threadId && s.mode === mode);
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

  const handleModeChange = (next: ChatMode) => {
    if (next === "agent" && isAuthenticated === false) {
      window.location.href = "/api/auth/signin?callbackUrl=" + encodeURIComponent("/");
      return;
    }
    void (async () => {
      await stop();
      setMode(next);
    })();
  };

  const handleCorpusChange = (next: CorpusChoice) => {
    void (async () => {
      await stop();
      setCorpus(next);
    })();
  };

  const handleModelSelect = (modelId: string) => {
    void (async () => {
      await stop();
      const previous = mode === "agent" ? agentModelId : chatModelId;
      const restore = () => {
        if (mode === "agent") setAgentModelId(previous);
        else setChatModelId(previous);
      };
      if (mode === "agent") setAgentModelId(modelId);
      else setChatModelId(modelId);
      void fetch("/api/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "agent" ? { agentModelId: modelId } : { chatModelId: modelId },
        ),
      })
        .then((res) => {
          if (!res.ok) restore();
        })
        .catch(restore);
    })();
  };

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
    void (async () => {
      await stop();
      clearError();
      setMode("chat");
    })();
  };

  const handleNewThread = () => {
    void (async () => {
      await stop();
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
    })();
  };

  const handleSelectSession = (session: ChatSessionRow) => {
    if (session.threadId === threadId && session.mode === mode) return;
    void (async () => {
      await stop();
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
    })();
  };

  const handleDeleteSession = (session: ChatSessionRow) => {
    const key = sessionCacheKey(session.mode === "agent" ? "agent" : "chat", session.threadId);
    delete messagesCacheRef.current[key];
    if (session.threadId !== threadId) return;
    void (async () => {
      await stop();
      clearError();
      skipHistoryLoadRef.current = true;
      rotateThreadId(mode);
      setThreadRevision((n) => n + 1);
      setMessages([]);
      setInput("");
    })();
  };

  return (
    <AppShell
      activePage="chat"
      mode={mode}
      onModeChange={handleModeChange}
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
          onModeChange={handleModeChange}
          modeDisabled={isLoading}
          onNewThread={handleNewThread}
          isAuthenticated={isAuthenticated}
        />

        {isAuthenticated === false ? (
          <div
            className="guest-banner"
            style={{
              margin: "0 16px 8px",
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(196, 92, 62, 0.12)",
              border: "1px solid rgba(196, 92, 62, 0.35)",
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--color-ink, inherit)",
            }}
          >
            游客试用：可直接对话（种子库、约每小时 5 次）。登录后解锁个人知识库、会话历史与 Agent。
            <Link href="/api/auth/signin" style={{ marginLeft: 8, fontWeight: 600 }}>
              去登录
            </Link>
          </div>
        ) : null}
        <section ref={streamRef} className="chat-stream">
          <div className="chat-stream-inner">
            {noMessages ? (
              <div className="empty-state">
                <h1 className="starter-headline">做个树洞吧</h1>
                <p className="starter-sub">
                  这里可以随便说。选一个话题开始，或者直接告诉我你最近在想什么。
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
              {isAuthenticated ? (
                <ModelChip
                  mode={mode}
                  modelId={selectedModelId}
                  models={savedModels}
                  disabled={isLoading}
                  onSelect={handleModelSelect}
                />
              ) : (
                <span />
              )}
              <span className="composer-corpus-hint">
                当前：
                {isAuthenticated === false
                  ? "种子库检索（游客）"
                  : corpus === "seed"
                    ? "种子库检索"
                    : "用户库检索"}
              </span>
              <CorpusToggle
                value={isAuthenticated === false ? "seed" : corpus}
                onChange={handleCorpusChange}
                disabled={isLoading || isAuthenticated === false}
              />
            </div>
            <div className="composer-shell">
              <input
                className="composer-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  mode === "agent" ? "描述复杂任务，例如调研并生成报告…" : "想问点啥呢～"
                }
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
                : isAuthenticated === false
                  ? "游客试用 · 种子库 · 登录后可用知识库与 Agent"
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
