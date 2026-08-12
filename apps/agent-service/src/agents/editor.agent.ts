/**
 * Editor 子 Agent：报告汇总（工具绑定见 02-02）。
 */

import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { createAgent } from "langchain";

export function createEditorAgent(model: LanguageModelLike) {
  return createAgent({
    name: "editor",
    description: "将调研与分析结果整理为可读报告。",
    model,
    tools: [],
    systemPrompt:
      "你是 Editor。职责边界：报告撰写与表述润色，整合 Retriever/Researcher/Analyst 产出。工具将在后续绑定；当前用中文输出结构清晰的最终稿。",
  });
}
