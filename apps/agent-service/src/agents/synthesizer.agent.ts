/**
 * Synthesizer 子 Agent：无工具，基于预检索结果成文（rag_generate）。
 */

import type { LanguageModelLike } from "@langchain/core/language_models/base";
import type { IntentPlan } from "@personal-gpt/shared/routing";
import { createAgent } from "langchain";

import { buildSynthesizerSystemPrompt } from "../agent/agent-synthesis";

export function createSynthesizerAgent(model: LanguageModelLike, plan: IntentPlan) {
  return createAgent({
    name: "synthesizer",
    description: "基于 retrieve 结果撰写用户可见的最终答案（rag_generate）。",
    model,
    tools: [],
    systemPrompt: buildSynthesizerSystemPrompt(plan),
  });
}
