---
name: web-research
description: 结构化多来源联网调研，支持并行委派调研员子 Agent
---

# 联网调研技能

当用户要求调研、调查、对比或深度分析某个主题，且需要外部公开信息时使用本技能。

> **注意**：本技能是主流程（Supervisor）的流程指南，**不是子 Agent**。联网搜索请委派 `researcher` 子 Agent，**不要**将 `web-research` 作为 handoff 目标或 subagent_type 调用。

## 流程

### 1. 规划

在调度前先在「任务分解」中明确（中文）：

- 主调研问题
- 2–4 个互不重叠的子主题（实际并行委派 ≤3）
- 每个子主题的预期产出
- 综合策略（如何合并 findings）

规划结果留在对话消息 / 图状态中即可，不依赖工作区文件树。

### 2. 委派（可并行）

对每个子主题，handoff 给 **researcher**，说明：

- 具体子主题与搜索关键词（优先中文）
- 单次任务 `web_search` 硬上限（见系统 caps，默认最多 10 次）
- 期望以结构化 findings 文本回传（标题、要点、来源 URL）

子主题相互独立时最多并行 **3** 个 researcher。**总数不超过 3。**

### 3. 综合

1. 收集各 researcher 回传的 findings（消息链路）
2. 整合成连贯分析，区分事实与推断
3. 若用户要正式报告：再委派 **editor** 审阅与排版（见 report-writer 技能）

## 降级

- 若 `web_search` 不可用 / 返回降级提示：如实转告，不伪造网页结果，也不中断整图
- 可回退到仅 KB（kb-retrieval）或说明外部信息暂不可用

## 最佳实践

- 委派前必须完成子主题规划
- 每个 researcher 只负责一个聚焦子主题
- Skill 名 `web-research` 永不进入 createSupervisor agents 列表
