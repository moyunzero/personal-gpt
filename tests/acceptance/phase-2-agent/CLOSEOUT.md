# Phase 2 / v2.0 核心关账（2026-08-12）

## 结论

**v2.0 核心已关账（MVP Complete）**：多 Agent 主链路可演示、可回归、有人工验收截图，并有 live SSE smoke（含 KB 命中）。

**不是生产就绪**：无正式鉴权多租户、无 agent Docker、无成功率/时延指标门禁。对外请说「MVP 关账 / 可演示」，不要说「Phase 2 生产完成」。

## v2.x 稳定性加固（2026-08-14）

在不宣称生产就绪的前提下，落地 Code Review 中「本阶段可做」项：

| 项 | 说明 |
| --- | --- |
| `web_search` 配额 | 按 `thread_id` 隔离；建图不再全局 `reset` |
| OpenAI 默认模型 | `DEFAULT_OPENAI_MODEL`（不再误用 Groq 模型名） |
| Checkpointer | MemorySaver / Sqlite **进程单例** |
| Body 校验 | Zod 校验 `messages` 数组元素 |
| 临时护栏 | 可选 `AGENT_INTERNAL_TOKEN`；浏览器经 `/api/agent/chat` BFF 注入 |
| Prompt | `kb-citation-rules` 单一 fragment；Supervisor 仅 Skills 名录 |
| 预检索 | 仅知识库相关意图 / 清单含 retriever 时执行 |
| 图工厂 | `buildAgentGraph` / `buildSupervisorGraph` 共用专科构建 |
| **Sequential 流水线** | 多步清单 ≥2 → 确定性边（对齐 LangGraph / CrewAI sequential）；主路径不再依赖强制续跑 |
| 轨迹去重 / 引用兜底 | tool 事件指纹去重；web URL 解析 + 终稿参考来源兜底 |

**仍延期**（写入 `docs/enterprise-roadmap.md`「v2.x → 后续版本」）：正式鉴权、Prompt registry、工具结构化错误码、Postgres checkpointer、Docker、God Service 拆分等。

浏览器复验：见 [BROWSER-RETEST-2026-08-14.md](./BROWSER-RETEST-2026-08-14.md)。

## 已交付

| 能力           | 说明                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| LangGraph 引擎 | 多步清单 Sequential 边 **或** 开放 Supervisor + Retriever / Researcher / Analyst / Editor                |
| SSE            | `POST /agent/chat`，兼容 UIMessage 流；web 默认经 `/api/agent/chat` BFF                                  |
| 前端           | Chat \| Agent 分段、待办、步骤面板                                                                       |
| Skills         | `kb-retrieval` / `web-research` / `report-writer` + `ENABLED_SKILLS`                                     |
| Checkpointer   | 默认 MemorySaver（进程单例）；可选 `AGENT_CHECKPOINTER=sqlite`                                           |
| LangSmith      | `LANGSMITH_TRACING=true` + key → project `personal-gpt-agent`（fail-open）                               |
| 检索诚实       | `AGENT_KB_MIN_SIMILARITY`；无命中不编造 DOC-*；citation fragment 统一                                   |
| 强制续跑       | 仅开放 Supervisor 兜底；多步清单走 Sequential 边                                                         |
| 执行轨迹       | SSE `data-agent-trace`；气泡时间线 + MD/JSON 下载；`AGENT_TRACE_PERSIST=true` 落盘 `.data/agent-traces/` |

## 验收证据

- 人工截图（KB-miss → 联网 → 报告）：本目录 `0*.png` + `checks.json`（**本地产物，不推 GitHub**）
- Live SSE smoke（KB 命中 + 主链路门禁）：`yarn acceptance:phase-2-smoke` → `SMOKE-RESULT.json` / `checks-kb-hit.json`（本地）
  - KB 命中：`documentId=phase2-kb-hit-zx7749` 真实 citation（服务端预检索，不依赖 Retriever LLM 是否调工具）
  - 主链路：步骤 + 报告正文 + 无技术码 / 无假 DOC-*
- 执行轨迹浏览器验收：`TRACE-OBS-RESULT.json` + `trace-obs-*.png`（本地）
- Mock 回归：`tests/regression/phase-2/`（01–05）

## Ship 最少三项（2026-08-12 已补）

1. KB 命中 live 证据：`checks-kb-hit.json`（本地跑 smoke 生成）
2. 自动化 `/agent/chat` SSE smoke：`yarn acceptance:phase-2-smoke`
3. 对外口径统一：README / 本文件写明 **MVP ≠ 生产就绪**

## 后续路线（2026-08-13 对标后；2026-08-14 补 Review 延期表）

见仓库 `docs/enterprise-roadmap.md`：**v3 检索/评测 → v4 身份/部署 → v5 连接器/HITL**，以及章节 **「v2.x → 后续版本：Code Review 延期项」**。v2 不再扩办事型工具。

## 明确延期（不算 v2.0 / v2.x 未完成债务）

| 项                                   | 去向                        |
| ------------------------------------ | --------------------------- |
| `file_read` / `report_generate` tool | v3+                         |
| Prompt registry / 工具结构化错误码   | v3                          |
| 强制续跑收进 Graph / 拆 God Service  | v3 末或编排 spike           |
| QuickJS REPL                         | 不采用；保留受限 calculator |
| Postgres checkpointer                | v4（v3 可试点）             |
| 正式鉴权 / ACL / workspace 身份绑定  | v4.0                        |
| agent-service Docker Compose         | v4.0                        |
| 报告 PDF 导出 / 流程图 UI            | v4.0                        |

## 本地建议

```bash
yarn workspace agent-service start:dev   # :3002
yarn workspace web dev                   # :3000 → Agent 模式（经 /api/agent/chat）
yarn acceptance:phase-2-smoke            # live SSE（需 embedding + Astra）
# 可选追踪
# LANGSMITH_API_KEY=... LANGSMITH_TRACING=true
# 可选执行轨迹落盘（评测复盘）
# AGENT_TRACE_PERSIST=true
# 可选 sqlite
# AGENT_CHECKPOINTER=sqlite
# 可选临时内部令牌（web BFF 自动带 Authorization）
# AGENT_INTERNAL_TOKEN=dev-secret
# AGENT_SERVICE_URL=http://localhost:3002
```
