"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useEffect, useRef } from "react";
import AppHeader from "./components/AppHeader";
import Bubble from "./components/Bubble";
import PromptSuggestionsRow from "./components/PromptSuggestionsRow";
import LoadingBubble from "./components/LoadingBubble";

export default function Home() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const streamRef = useRef<HTMLElement>(null);
  const noMessages = messages.length === 0;

  // 自动滚动到底部（消息或 loading 状态变化时触发）
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

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <main>
      <AppHeader activePage="chat" />

      {/* ===== 消息滚动区 ===== */}
      <section ref={streamRef} className="chat-stream">
        <div className="chat-stream-inner">
          {noMessages ? (
            <div className="empty-state">
              <h1 className="starter-headline">
                做个树洞吧～
              </h1>
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

      {/* ===== Composer：底部输入区 ===== */}
      <form onSubmit={handleSubmit} className="composer">
        <div className="composer-inner">
          <div className="composer-shell">
            <input
              className="composer-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="想问点啥呢~"
              disabled={isLoading}
              aria-label="输入消息"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="composer-send"
              aria-label="发送消息"
            >
              {isLoading ? (
                <svg
                  className="spinner"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
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
                  {/* 向上箭头：克制、不张扬的 send 图标 */}
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
            按 Enter 发送 · 内容可能不准确，仅供参考
          </p>
        </div>
      </form>
    </main>
  );
}
