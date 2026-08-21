"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import type {
  AgentTraceDocument,
  AgentTraceEvent,
  AgentTraceEventKind,
} from "@personal-gpt/shared/types/agent";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isTraceDocument(data: unknown): data is AgentTraceDocument {
  if (!isRecord(data)) return false;
  if (typeof data.threadId !== "string" || typeof data.startedAt !== "string") return false;
  if (typeof data.userText !== "string") return false;
  if (!isRecord(data.intent) || !Array.isArray(data.events) || !Array.isArray(data.plan)) {
    return false;
  }
  if (!Array.isArray(data.citations)) return false;
  const route = data.intent.route;
  if (route !== "short" && route !== "supervisor") return false;
  if (!Array.isArray(data.intent.requiredSpecialists)) return false;
  for (const item of data.plan) {
    if (!isRecord(item)) return false;
    if (typeof item.id !== "string" || typeof item.label !== "string") return false;
  }
  for (const c of data.citations) {
    if (!isRecord(c)) return false;
    if (typeof c.documentId !== "string" || typeof c.title !== "string") return false;
  }
  for (const ev of data.events) {
    if (!isRecord(ev)) return false;
    if (
      typeof ev.ts !== "string" ||
      typeof ev.kind !== "string" ||
      typeof ev.summary !== "string"
    ) {
      return false;
    }
  }
  return true;
}

/** 从 message.parts 提取最新一条 data-agent-trace */
export function extractAgentTrace(message: UIMessage): AgentTraceDocument | null {
  let latest: AgentTraceDocument | null = null;
  for (const part of message.parts) {
    if (!("type" in part) || typeof part.type !== "string") continue;
    if (part.type !== "data-agent-trace") continue;
    const data = "data" in part ? part.data : undefined;
    if (isTraceDocument(data)) latest = data;
  }
  return latest;
}

function kindLabel(kind: AgentTraceEventKind): string {
  switch (kind) {
    case "intent":
      return "意图";
    case "plan":
      return "拆解";
    case "specialist":
      return "专科";
    case "tool":
      return "工具";
    case "intermediate":
      return "中间";
    case "citation":
      return "引用";
    case "final":
      return "终稿";
    case "error":
      return "错误";
    default:
      return kind;
  }
}

export function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 延后 revoke，避免部分浏览器尚未开始下载就失效
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function toMarkdown(doc: AgentTraceDocument): string {
  const lines: string[] = [
    `# Agent 执行轨迹`,
    ``,
    `- threadId: \`${doc.threadId}\``,
    `- startedAt: ${doc.startedAt}`,
    `- endedAt: ${doc.endedAt ?? "(unknown)"}`,
    `- route: **${doc.intent.route}**`,
    `- requiredSpecialists: ${doc.intent.requiredSpecialists.join(", ") || "(none)"}`,
    ``,
    `## 用户问题`,
    ``,
    doc.userText,
    ``,
    `## 任务拆解`,
    ``,
  ];
  if (!doc.plan?.length) {
    lines.push("_无待办清单_");
  } else {
    for (const p of doc.plan) {
      lines.push(`- [${p.status}] ${p.label} (\`${p.id}\`)`);
    }
  }
  lines.push(``, `## 事件时间线`, ``);
  for (const e of doc.events) {
    const who = [e.agent, e.name].filter(Boolean).join(" / ");
    lines.push(`### ${e.ts} · ${e.kind}${who ? ` · ${who}` : ""}`);
    lines.push(``);
    lines.push(e.summary);
    if (e.detail) {
      lines.push(``, "```", e.detail, "```");
    }
    lines.push(``);
  }
  if (doc.citations?.length) {
    lines.push(`## 引用`, ``);
    for (const c of doc.citations) {
      lines.push(
        `- ${c.title} (\`${c.documentId}\`)${c.similarity != null ? ` sim=${c.similarity}` : ""}`,
      );
    }
    lines.push(``);
  }
  if (doc.finalText) {
    lines.push(`## 最终输出（截断）`, ``, doc.finalText, ``);
  }
  return lines.join("\n");
}

function TraceEventRow({ event }: { event: AgentTraceEvent }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(event.detail?.trim());
  const who = [event.agent, event.name].filter(Boolean).join(" · ");

  return (
    <li className="agent-trace-item">
      <button
        type="button"
        className="agent-trace-item-header"
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={hasDetail ? open : undefined}
        disabled={!hasDetail}
      >
        <span className={`agent-trace-kind agent-trace-kind-${event.kind}`}>
          {kindLabel(event.kind)}
        </span>
        <span className="agent-trace-summary">{event.summary}</span>
        {who ? <span className="agent-trace-who">{who}</span> : null}
        {hasDetail ? (
          <svg
            className={`agent-trace-chevron${open ? " agent-trace-chevron-open" : ""}`}
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path fill="currentColor" d="M4.5 6.5 8 10l3.5-3.5-.7-.7L8 8.6 5.2 5.8z" />
          </svg>
        ) : null}
      </button>
      {open && event.detail ? <pre className="agent-trace-detail">{event.detail}</pre> : null}
    </li>
  );
}

export default function AgentTracePanel({ message }: { message: UIMessage }) {
  const doc = extractAgentTrace(message);
  if (!doc || doc.events.length === 0) return null;

  const stamp = (doc.endedAt ?? doc.startedAt).replace(/[:.]/g, "-");
  const safeThread =
    doc.threadId.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "thread";
  const base = `agent-trace-${safeThread}-${stamp}`;

  return (
    <section className="agent-block agent-trace-panel" aria-label="执行轨迹">
      <div className="agent-trace-toolbar">
        <p className="agent-block-label">执行轨迹</p>
        <div className="agent-trace-actions">
          <button
            type="button"
            className="agent-trace-download"
            onClick={() =>
              downloadBlob(`${base}.md`, toMarkdown(doc), "text/markdown;charset=utf-8")
            }
          >
            下载 Markdown
          </button>
          <button
            type="button"
            className="agent-trace-download"
            onClick={() =>
              downloadBlob(
                `${base}.json`,
                `${JSON.stringify(doc, null, 2)}\n`,
                "application/json;charset=utf-8",
              )
            }
          >
            下载 JSON
          </button>
        </div>
      </div>
      <p className="agent-trace-meta">
        {doc.intent.route}
        {doc.intent.requiredSpecialists.length
          ? ` · ${doc.intent.requiredSpecialists.join(" → ")}`
          : ""}
        {` · ${doc.events.length} 事件`}
      </p>
      <ol className="agent-trace-list">
        {doc.events.map((e, i) => (
          <TraceEventRow key={`${e.ts}-${e.kind}-${i}`} event={e} />
        ))}
      </ol>
    </section>
  );
}
