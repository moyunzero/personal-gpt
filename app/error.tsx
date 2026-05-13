"use client";

import { useEffect } from "react";

/**
 * 路由段错误边界（Next.js App Router 原生 file convention）。
 *
 * 触发场景：app/page.tsx 及其子组件（Bubble / LoadingBubble /
 * PromptSuggestionsRow / ReactMarkdown）在渲染期间抛出未捕获错误时，
 * Next.js 会自动用这个组件替换路由段输出，避免出现完全空白页。
 *
 * 注意：本文件不包裹 app/layout.tsx 自身的错误（root layout 仅做 html
 * shell + metadata，崩溃面≈0，未额外加 global-error.tsx）。
 *
 * Next.js 16.2 API：
 *   - props 第二项为 `unstable_retry`，比旧 `reset` 更推荐
 *     （会重新 fetch + 重新渲染，而 reset 只清状态不重取）。
 *   - error.digest 是服务端错误的可观测 hash，可在排障时跟日志对齐。
 *
 * @see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
 */
export default function ChatError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // 即使生产环境 message 会被脱敏，打到 devtools 仍便于本地排障。
  useEffect(() => {
    console.error("[chat error boundary]", error);
  }, [error]);

  return (
    <main className="flex flex-1" role="alert" aria-live="assertive">
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: 20, margin: 0 }}>出了点小问题 😿</h2>
        <p style={{ margin: 0, color: "#666", maxWidth: 360, lineHeight: 1.6 }}>
          页面没能正常加载。可能是网络抖动，也可能是我这边代码偶发出错。
          点下面的按钮可以再试一次；如果一直失败，刷新整页也行。
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            border: "1px solid #383838",
            background: "#383838",
            color: "#fff",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          再试一次
        </button>
        {error.digest ? (
          <p style={{ margin: 0, fontSize: 12, color: "#999" }}>
            报错码：<code>{error.digest}</code>
          </p>
        ) : null}
      </section>
    </main>
  );
}
