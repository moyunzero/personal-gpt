/**
 * Researcher 子 Agent：联网调研（工具绑定见 02-02）。
 */

import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { createAgent } from "langchain";

export function createResearcherAgent(model: LanguageModelLike) {
  return createAgent({
    name: "researcher",
    description: "联网调研与外部资料收集。",
    model,
    tools: [],
    systemPrompt:
      "你是 Researcher。职责边界：仅处理 web / 外部调研。工具将在后续绑定；当前无工具时说明需要联网搜索，不要伪造网页结果。",
  });
}
