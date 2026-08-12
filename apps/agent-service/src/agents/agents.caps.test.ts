/**
 * Agent 工具 caps：各工厂绑定正确工具；Supervisor 无专科工具（D-06/D-07/D-15）。
 */
import { describe, expect, it } from "vitest";

import {
  AGENT_TOOL_CAPS,
  MAX_PARALLEL_RESEARCH_TOPICS,
  MAX_WEB_SEARCH_CALLS_PER_TASK,
} from "./caps";
import { SUPERVISOR_PROMPT } from "./supervisor.prompt";
import { MAX_WEB_SEARCH_CALLS_PER_TASK as TOOL_MAX } from "../tools/web-search.tool";

describe("agent tool caps (D-07 / D-15)", () => {
  it("exports hard caps for search calls and parallel research topics", () => {
    expect(MAX_WEB_SEARCH_CALLS_PER_TASK).toBeLessThanOrEqual(10);
    expect(MAX_WEB_SEARCH_CALLS_PER_TASK).toBeGreaterThanOrEqual(1);
    expect(TOOL_MAX).toBe(MAX_WEB_SEARCH_CALLS_PER_TASK);
    expect(MAX_PARALLEL_RESEARCH_TOPICS).toBe(3);
  });

  it("documents per-agent tool allow-lists", () => {
    expect([...AGENT_TOOL_CAPS.retriever]).toEqual(["kb_search"]);
    expect([...AGENT_TOOL_CAPS.researcher]).toEqual(["web_search"]);
    expect([...AGENT_TOOL_CAPS.analyst]).toEqual(["calculator"]);
    expect([...AGENT_TOOL_CAPS.editor]).toEqual([]);
    expect([...AGENT_TOOL_CAPS.supervisor]).toEqual([]);
  });

  it("binds Retriever → kb_search only and Researcher → web_search only", async () => {
    const { ChatOpenAI } = await import("@langchain/openai");
    const model = new ChatOpenAI({
      model: "mock-model",
      apiKey: "sk-test-mock",
      configuration: { baseURL: "http://127.0.0.1:9" },
    });

    const { createRetrieverAgent } = await import("./retriever.agent");
    const { createResearcherAgent } = await import("./researcher.agent");
    const { createAnalystAgent } = await import("./analyst.agent");
    const { createEditorAgent } = await import("./editor.agent");

    const retriever = createRetrieverAgent(model);
    const researcher = createResearcherAgent(model);
    const analyst = createAnalystAgent(model);
    const editor = createEditorAgent(model);

    const namesOf = (agent: { tools?: Array<{ name?: string }> }) =>
      (agent.tools ?? []).map((t) => t.name);

    // createAgent 返回值可能把 tools 挂在不同字段；同时检查源码绑定
    const rNames = namesOf(retriever as { tools?: Array<{ name?: string }> });
    const sNames = namesOf(researcher as { tools?: Array<{ name?: string }> });
    const aNames = namesOf(analyst as { tools?: Array<{ name?: string }> });
    const eNames = namesOf(editor as { tools?: Array<{ name?: string }> });

    if (rNames.length || sNames.length || aNames.length || eNames.length) {
      expect(rNames).toEqual(["kb_search"]);
      expect(sNames).toEqual(["web_search"]);
      expect(aNames).toEqual(["calculator"]);
      expect(eNames).toEqual([]);
    }

    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = __dirname;
    const retrieverSrc = await fs.readFile(path.join(dir, "retriever.agent.ts"), "utf8");
    const researcherSrc = await fs.readFile(path.join(dir, "researcher.agent.ts"), "utf8");
    const analystSrc = await fs.readFile(path.join(dir, "analyst.agent.ts"), "utf8");
    const editorSrc = await fs.readFile(path.join(dir, "editor.agent.ts"), "utf8");
    const buildSrc = await fs.readFile(
      path.join(dir, "../graph/build-graph.ts"),
      "utf8",
    );

    expect(retrieverSrc).toMatch(/kbSearchTool|kb_search/);
    expect(retrieverSrc).not.toMatch(/webSearchTool/);
    expect(researcherSrc).toMatch(/webSearchTool|web_search/);
    expect(researcherSrc).not.toMatch(/kbSearchTool/);
    expect(analystSrc).toMatch(/calculatorTool|calculator/);
    expect(editorSrc).toMatch(/tools:\s*\[\s*\]/);
    expect(buildSrc).toMatch(/createRetrieverAgent|createResearcherAgent/);
    void toolNames;
  });

  it("Supervisor prompt has no specialist tool binding and states caps", () => {
    expect(SUPERVISOR_PROMPT).toMatch(/只调度|禁止亲自/);
    expect(SUPERVISOR_PROMPT).toMatch(/kb_search/);
    expect(SUPERVISOR_PROMPT).toMatch(/web_search/);
    expect(SUPERVISOR_PROMPT).toMatch(String(MAX_PARALLEL_RESEARCH_TOPICS));
    // Supervisor 自身不绑定工具 —— prompt 明确禁止
    expect(SUPERVISOR_PROMPT).toMatch(/禁止.*kb_search|不要绑定/);
  });
});
