"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "./components/AppHeader";
import Bubble from "./components/Bubble";
import type { ChatMode } from "./components/ModeSegmentedControl";
import PromptSuggestionsRow from "./components/PromptSuggestionsRow";
import LoadingBubble from "./components/LoadingBubble";

const AGENT_SERVICE_URL =
  process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || "http://localhost:3002";

export default function Home() {
  const [mode, setMode] = useState<ChatMode>("chat");
  const [input, setInput] = useState("");
  const streamRef = useRef<HTMLElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api:
          mode === "agent"
            ? `${AGENT_SERVICE_URL.replace(/\/$/, "")}/agent/chat`
            : "/api/chat",
      }),
    [mode],
  );

  const { messages, sendMessage, status } = useChat({
    id: `home-${mode}`,
    transport,
  });

  const noMessages = messages.length === 0;
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (streamRef.current && !noMessages) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages, noMessages, status]);

  const handlePrompt = async (promptText: string) => {
    await sendMessage({ text: promptText });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await sendMessage({ text: input });
    setInput("");
  };

  return (
    <main>
      <AppHeader
        activePage="chat"
        mode={mode}
        onModeChange={setMode}
        modeDisabled={isLoading}
      />

      <section ref={streamRef} className="chat-stream">
        <div className="chat-stream-inner">
          {noMessages ? (
            <div className="empty-state">
              <h1 className="starter-headline">做个树洞吧～</h1>
              <p className="starter-sub">
                也可以了解我的经历和作品。挑一个话题开始，或者直接告诉我你最近在想什么。
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
                  isStreaming={
                    isLoading &&
                    index === messages.length - 1 &&
                    message.role === "assistant"
                  }
                />
              ))}
              {isLoading && <LoadingBubble />}
            </div>
          )}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="composer">
        <div className="composer-inner">
          <div className="composer-shell">
            <input
              className="composer-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === "agent"
                  ? "描述复杂任务，例如调研并生成报告…"
                  : "想问点啥呢~"
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
            {mode === "agent"
              ? "Agent 模式 · 复杂任务走多 Agent · 闲聊会短路回复"
              : "按 Enter 发送 · 内容可能不准确，仅供参考"}
          </p>
        </div>
      </form>
    </main>
  );
}
