"use client"
import Image from "next/image";
import { useChat } from "@ai-sdk/react";
import { useState, useEffect, useRef } from "react";
import Bubble from "./components/Bubble";
import PromptSuggestionsRow from "./components/PromptSuggestionsRow";
import LoadingBubble from "./components/LoadingBubble";

export default function Home() {
  const { messages, sendMessage, status } = useChat({
    api: '/api/chat',
  });
  const [input, setInput] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const noMessages = messages.length === 0;

  // 自动滚动到底部
  useEffect(() => {
    if (sectionRef.current && !noMessages) {
      sectionRef.current.scrollTop = sectionRef.current.scrollHeight;
    }
  }, [messages, noMessages]);

  const handlePrompt = async (promptText: string) => {
    await sendMessage({ text: promptText });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    await sendMessage({ text: input });
    setInput("");
  };

  const isLoading = status === 'submitted' || status === 'streaming';

  return (
      <main className="flex flex-1">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <section ref={sectionRef} className={noMessages? "" : "populated"}>
          {noMessages ? (
            <>
              <p className="starter-text">
                做个树洞～
                <br />
                也可以了解我的经历和作品～
              </p>
              <br />
              <PromptSuggestionsRow onPromptClick={handlePrompt} />
            </> 
          ) : (
            <div className="messages-container">
              {messages.map((message, index) => (
                <Bubble key={message.id || `message-${index}`} message={message} />
              ))}
              {isLoading && <LoadingBubble />}
            </div>
          )}
        </section>
         <form onSubmit={handleSubmit} className="input-form">
            <div className="input-container">
              <input 
                className="question-box" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="想问点啥呢~" 
                disabled={isLoading}
              />
              <button 
                type="submit" 
                disabled={isLoading || !input.trim()}
                className="send-button"
                aria-label="发送消息"
              >
                {isLoading ? (
                  <svg className="spinner" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="32">
                      <animate attributeName="stroke-dashoffset" values="32;0" dur="1s" repeatCount="indefinite" />
                    </circle>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            </div>
          </form>
      </main>
  );
}
