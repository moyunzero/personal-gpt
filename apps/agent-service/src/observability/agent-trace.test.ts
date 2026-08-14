/**
 * Agent 执行轨迹采集器单测（无 live LLM）。
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  TRACE_DETAIL_MAX,
  createAgentTraceCollector,
  summarizeKbToolOutput,
  truncateTraceText,
} from "./agent-trace";

describe("truncateTraceText", () => {
  it("clips long detail with ellipsis", () => {
    const long = "x".repeat(TRACE_DETAIL_MAX + 50);
    const out = truncateTraceText(long);
    expect(out.length).toBe(TRACE_DETAIL_MAX + 1);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("summarizeKbToolOutput", () => {
  it("summarizes HIT with document ids", () => {
    expect(
      summarizeKbToolOutput("KB_SEARCH_STATUS: HIT\ndocumentId: doc-a\ndocumentId: doc-b"),
    ).toContain("HIT");
    expect(summarizeKbToolOutput("KB_SEARCH_STATUS: NO_RELEVANT_HIT")).toBe("NO_RELEVANT_HIT");
  });
});

describe("createAgentTraceCollector", () => {
  const dirs: string[] = [];
  const initialPersist = process.env.AGENT_TRACE_PERSIST;
  const initialDir = process.env.AGENT_TRACE_DIR;

  afterEach(() => {
    if (initialPersist === undefined) delete process.env.AGENT_TRACE_PERSIST;
    else process.env.AGENT_TRACE_PERSIST = initialPersist;
    if (initialDir === undefined) delete process.env.AGENT_TRACE_DIR;
    else process.env.AGENT_TRACE_DIR = initialDir;
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("records intent → plan → tool → final in order and builds markdown", () => {
    const c = createAgentTraceCollector({
      threadId: "t-1",
      userText: "比较 A 与 B 并出报告",
      intent: {
        route: "supervisor",
        requiredSpecialists: ["retriever", "researcher", "editor"],
      },
    });
    c.recordPlan([
      { id: "1", label: "检索", status: "completed" },
      { id: "2", label: "成稿", status: "active" },
    ]);
    c.recordTool({
      name: "kb_search",
      summary: "预检索 · HIT",
      detail: "KB_SEARCH_STATUS: HIT\ndocumentId: x",
    });
    c.recordSpecialist("Retriever", "检索知识库");
    c.setFinalText("这是终稿正文。");
    const doc = c.finish();

    expect(doc.events.map((e) => e.kind)).toEqual([
      "intent",
      "plan",
      "tool",
      "specialist",
      "final",
    ]);
    expect(doc.intent.route).toBe("supervisor");
    expect(doc.finalText).toContain("终稿");

    const md = c.toMarkdown();
    expect(md).toContain("# Agent 执行轨迹");
    expect(md).toContain("## 用户问题");
    expect(md).toContain("## 任务拆解");
    expect(md).toContain("kb_search");
    expect(md).toContain("## 最终输出（截断）");
  });

  it("dedupes identical tool events", () => {
    const c = createAgentTraceCollector({
      threadId: "t-dedupe",
      userText: "x",
      intent: { route: "supervisor", requiredSpecialists: [] },
    });
    c.recordTool({
      name: "kb_search",
      summary: "预检索 · NO_RELEVANT_HIT",
      detail: "KB_SEARCH_STATUS: NO_RELEVANT_HIT\na",
    });
    c.recordTool({
      name: "kb_search",
      summary: "NO_RELEVANT_HIT",
      detail: "KB_SEARCH_STATUS: NO_RELEVANT_HIT\nb",
    });
    const doc = c.finish();
    expect(doc.events.filter((e) => e.kind === "tool")).toHaveLength(1);
  });

  it("persists json+md when AGENT_TRACE_PERSIST=true", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-trace-"));
    dirs.push(dir);
    process.env.AGENT_TRACE_PERSIST = "true";
    process.env.AGENT_TRACE_DIR = dir;

    const c = createAgentTraceCollector({
      threadId: "persist-1",
      userText: "hello",
      intent: { route: "short", requiredSpecialists: [] },
    });
    c.setFinalText("done");
    c.finish();
    const base = c.persistIfEnabled();
    expect(base).toBeTruthy();
    const json = JSON.parse(readFileSync(`${base}.json`, "utf8"));
    expect(json.threadId).toBe("persist-1");
    expect(json.events.length).toBeGreaterThan(0);
    const md = readFileSync(`${base}.md`, "utf8");
    expect(md).toContain("Agent 执行轨迹");
  });

  it("bounds event count and sanitizes unsafe threadId in persist path", async () => {
    const { TRACE_EVENTS_MAX } = await import("./agent-trace");
    const dir = mkdtempSync(join(tmpdir(), "agent-trace-"));
    dirs.push(dir);
    process.env.AGENT_TRACE_PERSIST = "true";
    process.env.AGENT_TRACE_DIR = dir;

    const c = createAgentTraceCollector({
      threadId: "../evil/../thread",
      userText: "x",
      intent: { route: "supervisor", requiredSpecialists: [] },
    });
    for (let i = 0; i < TRACE_EVENTS_MAX + 40; i++) {
      c.recordSpecialist("retriever", `s-${i}`);
    }
    const doc = c.finish();
    expect(doc.events.length).toBeLessThanOrEqual(TRACE_EVENTS_MAX);
    const base = c.persistIfEnabled();
    expect(base).toBeTruthy();
    expect(base!.split("/").pop() ?? "").not.toMatch(/\.\./);
  });
});
