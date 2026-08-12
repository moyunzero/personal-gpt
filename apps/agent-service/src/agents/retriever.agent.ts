/**
 * Retriever 子 Agent：知识库检索（工具绑定见 02-02）。
 */

import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { createAgent } from "langchain";

export function createRetrieverAgent(model: LanguageModelLike) {
  return createAgent({
    name: "retriever",
    description: "企业内部知识库检索与引用；回答需可溯源。",
    model,
    tools: [],
    systemPrompt:
      "你是 Retriever。职责边界：仅处理知识库（KB）检索与引用相关问题。工具将在后续绑定；当前无工具时说明需要 KB 检索能力，不要编造文档内容。",
  });
}
