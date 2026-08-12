# Phase 2 / v2.0 核心关账（2026-08-12）

## 结论

**v2.0 核心已关账（MVP Complete）**：多 Agent 主链路可演示、可回归、有人工验收截图。

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

## 验收证据

- 人工截图：本目录 `0*.png` + `checks.json`
- Mock 回归：`tests/regression/phase-2/`（01–05）

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
# 可选追踪
# LANGSMITH_API_KEY=... LANGSMITH_TRACING=true
# 可选 sqlite
# AGENT_CHECKPOINTER=sqlite
```
