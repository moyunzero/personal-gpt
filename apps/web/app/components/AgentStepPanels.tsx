"use client";

import { useState } from "react";
import type { UIMessage } from "ai";

export type AgentStepStatus = "pending" | "active" | "completed" | "error";

export type AgentStep = {
  id: string;
  agent: string;
  title: string;
  status: AgentStepStatus;
  summary?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseStep(data: unknown, fallbackId: string): AgentStep | null {
  if (!isRecord(data)) return null;
  const agent = typeof data.agent === "string" ? data.agent : "";
  const title = typeof data.title === "string" ? data.title : "";
  if (!agent && !title) return null;
  const statusRaw = typeof data.status === "string" ? data.status : "pending";
  const status: AgentStepStatus =
    statusRaw === "active" ||
    statusRaw === "completed" ||
    statusRaw === "error" ||
    statusRaw === "pending"
      ? statusRaw
      : "pending";
  return {
    id: typeof data.id === "string" ? data.id : fallbackId,
    agent: agent || "Agent",
    title: title || agent,
    status,
    summary: typeof data.summary === "string" ? data.summary : undefined,
  };
}

/** 从 message.parts 提取 data-agent-step（同 id 保留最新） */
export function extractAgentSteps(message: UIMessage): AgentStep[] {
  const byId = new Map<string, AgentStep>();
  let anon = 0;
  for (const part of message.parts) {
    if (!("type" in part) || typeof part.type !== "string") continue;
    if (part.type !== "data-agent-step") continue;
    const id = "id" in part && typeof part.id === "string" ? part.id : `step-${anon++}`;
    const data = "data" in part ? part.data : undefined;
    const step = parseStep(data, id);
    if (step) byId.set(step.id, step);
  }
  return [...byId.values()];
}

function statusLabel(status: AgentStepStatus): string {
  switch (status) {
    case "active":
      return "进行中";
    case "completed":
      return "完成";
    case "error":
      return "失败";
    default:
      return "待办";
  }
}

function StepCard({ step }: { step: AgentStep }) {
  const defaultOpen = step.status === "active";
  const [expanded, setExpanded] = useState(defaultOpen);
  const bodyId = `${step.id}-body`;

  return (
    <article className={`agent-step-card${expanded ? " agent-step-card-open" : ""}`}>
      <button
        type="button"
        className="agent-step-header"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="agent-step-title">
          <span className="agent-step-agent">{step.agent}</span>
          <span>{step.title}</span>
        </span>
        <span className="agent-step-meta">
          {step.status === "active" || step.status === "error" ? (
            <span
              className={`agent-step-status-dot${step.status === "error" ? " agent-step-status-dot-error" : ""}`}
              aria-hidden="true"
            />
          ) : null}
          <span>{statusLabel(step.status)}</span>
          <svg
            className={`agent-step-chevron${expanded ? " agent-step-chevron-open" : ""}`}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {expanded && step.summary ? (
        <p id={bodyId} className="agent-step-body">
          {step.summary}
        </p>
      ) : expanded ? (
        <p id={bodyId} className="agent-step-body agent-step-body-empty">
          暂无详情
        </p>
      ) : (
        <span id={bodyId} hidden />
      )}
    </article>
  );
}

export default function AgentStepPanels({
  message,
  markActiveAsError = false,
}: {
  message: UIMessage;
  /** 流失败时：把仍在进行中的步骤显示为失败 */
  markActiveAsError?: boolean;
}) {
  const steps = extractAgentSteps(message).map((step) =>
    markActiveAsError && step.status === "active"
      ? {
          ...step,
          status: "error" as const,
          summary: step.summary ? `${step.summary} · 执行中断` : "执行中断 · 未能完成",
        }
      : step,
  );
  if (steps.length === 0) return null;

  return (
    <div className="agent-block" aria-label="执行步骤">
      <p className="agent-block-label">执行步骤</p>
      <div className="agent-step-list">
        {steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </div>
    </div>
  );
}

export { AgentStepPanels };
