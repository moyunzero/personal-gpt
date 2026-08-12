---
name: kb-retrieval
description: 企业内部知识库检索与引用整理，明确委派 Retriever 子 Agent
---

# 知识库检索技能

当用户问题需要基于企业已上传文档、内部制度或知识库内容回答时使用本技能。

> **注意**：本技能是 Supervisor / 主流程的流程指南，**不是**子 Agent。知识库检索请委派 `retriever` 子 Agent，**不要**将 `kb-retrieval` 当作 handoff 目标或 subagent_type。

## 何时使用

- 用户询问公司政策、产品文档、内部手册等内容
- 回答需要可溯源引用（title / source / documentId）
- 与联网调研并存时：先或并行走 KB，再视需要补外部来源

## 流程

### 1. 委派 Retriever

将检索任务交给 **retriever** 子 Agent，在任务说明中写清：

- 用户原始问题与检索意图
- 当前 `workspaceId`（若会话状态已有）：检索必须按 workspace 过滤，禁止跨库混用
- 期望返回：相关片段 + 可溯源元数据（title、source、documentId）

### 2. 引用整理

- 综合 Retriever 产出时保留 citations，禁止编造文档内容
- 命中不足或出现 `KB_SEARCH_STATUS: NO_RELEVANT_HIT` 时如实说明「知识库未找到足够依据」，不要假装有引用、禁止编造 DOC-*
- 混库召回边界仍存在时，优先信任带正确 workspace 元数据且通过相似度门槛的结果

## 最佳实践

- 仅调度、不亲自调用 `kb_search`
- Skill 名 `kb-retrieval` 只出现在流程指引中，永不进入 agents / handoff 列表
