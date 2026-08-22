import { describe, expect, it } from "vitest";

import { buildSynthesizerSystemPrompt, isRetrieverSynthesisPlan } from "./agent-synthesis";

const KB_PLAN = {
  primary: "kb_doc" as const,
  channels: "kb" as const,
  specialists: ["retriever"],
  retrieverTools: ["kb_search"],
  fallbackChain: [],
  reason: "test",
  confidence: 0.8,
  graphSignal: false,
};

const GRAPH_PLAN = {
  primary: "graph_relation" as const,
  channels: "graph" as const,
  specialists: ["retriever"],
  retrieverTools: ["graph_search"],
  fallbackChain: ["kb_search"],
  reason: "test",
  confidence: 0.95,
  graphSignal: true,
};

describe("isRetrieverSynthesisPlan", () => {
  it("kb_doc retriever → synthesis", () => {
    expect(isRetrieverSynthesisPlan(KB_PLAN)).toBe(true);
  });

  it("graph_relation retriever → synthesis", () => {
    expect(isRetrieverSynthesisPlan(GRAPH_PLAN)).toBe(true);
  });

  it("researcher single specialist → not synthesis", () => {
    expect(
      isRetrieverSynthesisPlan({
        ...KB_PLAN,
        primary: "web_research",
        specialists: ["researcher"],
        retrieverTools: [],
      }),
    ).toBe(false);
  });
});

describe("buildSynthesizerSystemPrompt", () => {
  it("includes Chat-aligned general-knowledge fallback rule", () => {
    const prompt = buildSynthesizerSystemPrompt(KB_PLAN);
    expect(prompt).toContain("不得以「知识库没有」为由拒绝");
    expect(prompt).toContain("rag_generate");
  });

  it("includes KB citation rules for kb_doc", () => {
    expect(buildSynthesizerSystemPrompt(KB_PLAN)).toContain("【知识库引用硬规则】");
  });

  it("omits KB citation block for graph-only", () => {
    expect(buildSynthesizerSystemPrompt(GRAPH_PLAN)).not.toContain("【知识库引用硬规则】");
  });
});
