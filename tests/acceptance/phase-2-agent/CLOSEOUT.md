# Phase 2 / v2.0 核心关账（2026-08-12）

## 结论

**v2.0 核心已关账（MVP Complete）**：多 Agent 主链路可演示、可回归、有人工验收截图，并有 live SSE smoke（含 KB 命中）。

**不是生产就绪**：无鉴权多租户、无 agent Docker、无成功率/时延指标门禁、编排仍含强制续跑兜底。对外请说「MVP 关账 / 可演示」，不要说「Phase 2 生产完成」。

## 已交付

| 能力 | 说明 |
|------|------|
| LangGraph 引擎 | Supervisor + Retriever / Researcher / Analyst / Editor |
| SSE | `POST /agent/chat`，兼容 UIMessage 流 |
| 前端 | Chat \| Agent 分段、待办、步骤面板 |
| Skills | `kb-retrieval` / `web-research` / `report-writer` + `ENABLED_SKILLS` |
| Checkpointer | 默认 MemorySaver；可选 `AGENT_CHECKPOINTER=sqlite` |
| LangSmith | `LANGSMITH_TRACING=true` + key → project `personal-gpt-agent`（fail-open） |
| 检索诚实 | `AGENT_KB_MIN_SIMILARITY`；无命中不编造 DOC-* |
| 强制续跑 | 多步清单未完成时代码续调 Editor |
| 执行轨迹 | SSE `data-agent-trace`；气泡时间线 + MD/JSON 下载；`AGENT_TRACE_PERSIST=true` 落盘 `.data/agent-traces/` |

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

## 后续路线（2026-08-13 对标后）

见仓库 `docs/enterprise-roadmap.md`：**v3 检索/评测 → v4 身份/部署 → v5 连接器/HITL**。v2 不再扩办事型工具。

## 明确延期（不算 v2.0 未完成债务）

| 项 | 去向 |
|----|------|
| `file_read` / `report_generate` tool | v3+ |
| QuickJS REPL | 不采用；保留受限 calculator |
| Postgres checkpointer | 可选后续 |
| agent-service Docker Compose | v4.0 |
| 报告 PDF 导出 / 流程图 UI | v4.0 |

## 本地建议

```bash
yarn workspace agent-service start:dev   # :3002
yarn workspace web dev                   # :3000 → Agent 模式
yarn acceptance:phase-2-smoke            # live SSE（需 embedding + Astra）
# 可选追踪
# LANGSMITH_API_KEY=... LANGSMITH_TRACING=true
# 可选执行轨迹落盘（评测复盘）
# AGENT_TRACE_PERSIST=true
# 可选 sqlite
# AGENT_CHECKPOINTER=sqlite
```
