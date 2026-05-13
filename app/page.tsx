"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useEffect, useRef } from "react";
import Bubble from "./components/Bubble";
import PromptSuggestionsRow from "./components/PromptSuggestionsRow";
import LoadingBubble from "./components/LoadingBubble";

/**
 * Anthropic 风格 4 叶径向"火花"标记（spike-mark）。
 * DESIGN.md 提到这是品牌 wordmark 前缀，本组件用作 header 标识与助手头像。
 */
const SpikeMark = ({ className = "" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 2 L13 11 L22 12 L13 13 L12 22 L11 13 L2 12 L11 11 Z" />
  </svg>
);

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
      {/* ===== Header：spike-mark + wordmark ===== */}
      <header className="chat-header">
        <div className="chat-header-inner">
          <SpikeMark className="spike-mark" />
          <span className="wordmark">Personal · Emotion GPT</span>
        </div>
      </header>

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
