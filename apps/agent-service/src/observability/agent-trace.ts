/**
 * Agent 执行轨迹采集：意图 / 拆解 / 工具 / 中间摘要 / 终稿。
 * 非模型内部 CoT；供 SSE data-agent-trace 与可选落盘。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  AgentTraceDocument,
  AgentTraceEvent,
  AgentTraceEventKind,
  AgentTraceIntent,
  AgentTracePlanItem,
  TodoStatus,
} from "@personal-gpt/shared";

export const TRACE_DETAIL_MAX = 2000;
export const TRACE_FINAL_MAX = 8000;

export function truncateTraceText(text: string, max = TRACE_DETAIL_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export type AgentTraceCollector = {
  recordPlan: (items: Array<{ id: string; label: string; status: TodoStatus }>) => void;
  recordSpecialist: (agent: string, summary: string, detail?: string) => void;
  recordTool: (input: { name: string; summary: string; detail?: string; agent?: string }) => void;
  recordIntermediate: (agent: string, text: string) => void;
  recordError: (summary: string, detail?: string) => void;
  setCitations: (citations: AgentTraceDocument["citations"]) => void;
  appendFinalText: (delta: string) => void;
  setFinalText: (text: string) => void;
  finish: () => AgentTraceDocument;
  toMarkdown: () => string;
  persistIfEnabled: () => string | null;
};

export function createAgentTraceCollector(input: {
  threadId: string;
  userText: string;
  intent: AgentTraceIntent;
  langsmithProject?: string;
}): AgentTraceCollector {
  const startedAt = nowIso();
  const events: AgentTraceEvent[] = [];
  let plan: AgentTracePlanItem[] = [];
  let citations: AgentTraceDocument["citations"] = [];
  let finalText = "";
  let endedAt: string | undefined;
  let persisted = false;

  const push = (kind: AgentTraceEventKind, summary: string, extra?: Partial<AgentTraceEvent>) => {
    events.push({
      ts: nowIso(),
      kind,
      summary,
      ...extra,
      detail: extra?.detail !== undefined ? truncateTraceText(extra.detail) : undefined,
    });
  };

  push(
    "intent",
    `路由=${input.intent.route}；强制专科=[${input.intent.requiredSpecialists.join(", ") || "无"}]`,
    {
      name: "intent",
      detail: truncateTraceText(input.userText, 500),
    },
  );

  const toDocument = (): AgentTraceDocument => ({
    threadId: input.threadId,
    startedAt,
    endedAt,
    userText: truncateTraceText(input.userText, 2000),
    intent: input.intent,
    plan,
    events: [...events],
    citations,
    finalText: finalText ? truncateTraceText(finalText, TRACE_FINAL_MAX) : undefined,
    meta: {
      langsmithProject: input.langsmithProject,
      persisted,
    },
  });

  const toMarkdown = (): string => {
    const doc = toDocument();
    const lines: string[] = [
      `# Agent 执行轨迹`,
      ``,
      `- threadId: \`${doc.threadId}\``,
      `- startedAt: ${doc.startedAt}`,
      `- endedAt: ${doc.endedAt ?? "(running)"}`,
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
    if (doc.plan.length === 0) {
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
        lines.push(``);
        lines.push("```");
        lines.push(e.detail);
        lines.push("```");
      }
      lines.push(``);
    }
    if (doc.citations.length) {
      lines.push(`## 引用`, ``);
      for (const c of doc.citations) {
        lines.push(
          `- ${c.title} (\`${c.documentId}\`)${c.similarity != null ? ` sim=${c.similarity}` : ""}${c.source ? ` · ${c.source}` : ""}`,
        );
      }
      lines.push(``);
    }
    if (doc.finalText) {
      lines.push(`## 最终输出（截断）`, ``, doc.finalText, ``);
    }
    return lines.join("\n");
  };

  return {
    recordPlan(items) {
      plan = items.map((i) => ({
        id: i.id,
        label: i.label,
        status: i.status,
      }));
      push("plan", `待办 ${plan.length} 项：${plan.map((p) => p.label).join(" → ") || "(空)"}`, {
        name: "plan",
      });
    },
    recordSpecialist(agent, summary, detail) {
      push("specialist", summary, { agent, name: agent, detail });
    },
    recordTool({ name, summary, detail, agent }) {
      push("tool", summary, { name, agent, detail });
    },
    recordIntermediate(agent, text) {
      const clipped = truncateTraceText(text);
      if (!clipped) return;
      push("intermediate", `${agent} 中间输出 ${clipped.length} 字`, {
        agent,
        name: "intermediate",
        detail: clipped,
      });
    },
    recordError(summary, detail) {
      push("error", summary, { name: "error", detail });
    },
    setCitations(cites: AgentTraceDocument["citations"]) {
      citations = cites.map((c: AgentTraceDocument["citations"][number]) => ({
        documentId: c.documentId,
        title: c.title,
        similarity: c.similarity,
        source: c.source,
      }));
      if (citations.length) {
        push(
          "citation",
          `引用 ${citations.length} 条：${citations.map((c: AgentTraceDocument["citations"][number]) => c.documentId).join(", ")}`,
          { name: "citations" },
        );
      }
    },
    appendFinalText(delta) {
      finalText += delta;
    },
    setFinalText(text) {
      finalText = text;
    },
    finish() {
      endedAt = nowIso();
      if (finalText.trim()) {
        push("final", `终稿 ${Math.min(finalText.length, TRACE_FINAL_MAX)} 字（可截断）`, {
          name: "final",
          detail: truncateTraceText(finalText, 400),
        });
      }
      return toDocument();
    },
    toMarkdown,
    persistIfEnabled() {
      if (process.env.AGENT_TRACE_PERSIST !== "true") return null;
      endedAt = endedAt ?? nowIso();
      const dir =
        process.env.AGENT_TRACE_DIR?.trim() || resolve(process.cwd(), ".data/agent-traces");
      mkdirSync(dir, { recursive: true });
      const stamp = (endedAt ?? nowIso()).replace(/[:.]/g, "-");
      const base = resolve(dir, `${input.threadId}-${stamp}`);
      persisted = true;
      const doc = toDocument();
      writeFileSync(`${base}.json`, `${JSON.stringify(doc, null, 2)}\n`);
      writeFileSync(`${base}.md`, toMarkdown());
      return base;
    },
  };
}

/** 从 kb_search 工具文本生成短摘要 */
export function summarizeKbToolOutput(text: string): string {
  if (/KB_SEARCH_STATUS:\s*HIT/i.test(text)) {
    const ids = [...text.matchAll(/documentId:\s*(\S+)/gi)].map((m) => m[1]);
    return `HIT · ${ids.length ? ids.join(", ") : "有命中"}`;
  }
  if (/KB_SEARCH_STATUS:\s*NO_RELEVANT_HIT/i.test(text)) {
    return "NO_RELEVANT_HIT";
  }
  return truncateTraceText(text, 120);
}
