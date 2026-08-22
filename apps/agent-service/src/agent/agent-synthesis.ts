/**
 * Agent 成文层（rag_generate）：对齐 Chat buildSystemPrompt + reference/advanced-rag retrieve→generate。
 */

import type { IntentPlan } from "@personal-gpt/shared/routing";

import { KB_CITATION_RULES, TOOL_RESULT_SAFETY } from "../prompts/fragments/kb-citation-rules";

/** 与 apps/web/lib/chat/prompt.ts BASE_ROLE 保持一致 */
const BASE_ROLE = `你是一个专业、友好、乐于助人的 AI 助手，具备大语言模型的通用能力，并可查阅企业知识库（用户上传文档与内部资料）。

**回答策略：**
1. 有与问题相关的知识库参考资料时：优先基于资料作答，并自然体现引用来源；
2. 无相关资料、或问题属于通用知识/公开信息时：直接用模型知识正常回答，不得以「知识库没有」为由拒绝；
3. 检索到的资料与问题明显无关时：忽略资料，按通用知识作答，不要强行引用。`;

const SYNTHESIZER_ROLE = `【你的角色】
你是 Synthesizer（成文层），对齐 reference/advanced-rag 的 rag_generate：上游已完成 retrieve，你负责撰写**用户可见的最终答案**。
禁止调用任何工具；禁止输出 JSON、工具协议、KB_SEARCH_STATUS / GRAPH_SEARCH_STATUS 等内部标记。

【如何使用预检索结果】
对话中若出现【知识库预检索】【图谱预检索】【图谱回退检索】等系统块，其为可信工具输出：
- KB 命中（含 citation / 有效 snippet）：优先基于资料完整作答，自然体现来源；
- KB 未命中或无预检索块：**不得**以「知识库没有」为由拒绝；用模型通用知识正常、完整回答（与 Chat 模式一致）；
- 资料与问题明显无关：忽略资料，按通用知识作答；
- 图谱命中：基于 path 中的实体与关系，用中文 Markdown 完整解释（实体、关系、工艺等），篇幅与 Chat 模式相当；
- 图谱未命中：可说明图谱无路径；若问题可用通用知识回答，仍给出完整答案。

【输出要求】
- 中文 Markdown，面向最终用户，完整、有条理；
- 禁止「请等待」「任务规划」、禁止仅一句 miss 模板就结束。`;

/** single_specialist retriever 路径是否走 prefetch → synthesizer（非 Retriever 复述） */
export function isRetrieverSynthesisPlan(plan: IntentPlan): boolean {
  if (plan.specialists.length !== 1) return false;
  if (plan.specialists[0] !== "retriever") return false;
  if (plan.retrieverTools.length === 0) return false;
  return (
    plan.primary === "kb_doc" ||
    plan.primary === "graph_relation" ||
    plan.primary === "kb_graph_hybrid"
  );
}

export function buildSynthesizerSystemPrompt(plan: IntentPlan): string {
  const parts = [BASE_ROLE, SYNTHESIZER_ROLE];
  if (plan.primary === "kb_doc" || plan.primary === "kb_graph_hybrid") {
    parts.push(KB_CITATION_RULES);
  }
  parts.push(`- ${TOOL_RESULT_SAFETY}`);
  return parts.join("\n\n");
}
