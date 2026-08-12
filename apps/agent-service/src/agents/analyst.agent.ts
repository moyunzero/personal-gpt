/**
 * Analyst 子 Agent：数值 / 结构化分析（工具绑定见 02-02）。
 */

import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { createAgent } from "langchain";

export function createAnalystAgent(model: LanguageModelLike) {
  return createAgent({
    name: "analyst",
    description: "数值计算、结构化对比与分析。",
    model,
    tools: [],
    systemPrompt:
      "你是 Analyst。职责边界：数值、表格、结构化对比与分析。工具将在后续绑定；当前无工具时基于给定材料做清晰结构化分析，标明假设。",
  });
}
