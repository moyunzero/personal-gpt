# Personal GPT

## What This Is

Personal GPT 是一个基于 Next.js 与 RAG 技术的智能知识库问答平台。v0.1 已完成个人 RAG 聊天原型；当前里程碑（v2.0）将其演进为**企业级知识库**：支持文档自助导入与管理、检索可溯源、workspace 隔离，并逐步引入 LangGraph 多 Agent 与生产化部署能力。

## Core Value

用户能**上传企业文档、基于自有知识库获得可溯源的准确回答**——回答必须展示引用来源，知识库数据按 workspace 隔离。

## Requirements

### Validated

- ✓ 单页 RAG 聊天 UI（流式、Markdown、快捷建议）— v0.1
- ✓ `POST /api/chat` 智能检索 + Astra DB 向量搜索 — v0.1
- ✓ OpenRouter 多模型 fallback + embedding 缓存 — v0.1
- ✓ 脚本侧知识库导入（seed:suggestions 等）— v0.1
- ✓ Vitest 单元测试 + GitHub Actions CI — v0.1

### Active

<!-- v2.0 企业级知识库 — 见 REQUIREMENTS.md -->

- [ ] Monorepo + Docker Compose（PG + Redis + BullMQ）
- [ ] 文档上传异步入库（PDF/MD/TXT/Word）
- [ ] 知识库管理 UI + CRUD
- [ ] 聊天引用溯源（citations 返回前端）
- [ ] workspaceId 全链路隔离（默认 `default`）
- [ ] LangGraph 多 Agent 协作（Phase 2）
- [ ] 记忆系统 + 多存储 + 高级 RAG（Phase 3）
- [ ] 生产就绪：Docker、认证、多租户、监控（Phase 4 Wave 1）
- [ ] Graph KB 产品化：入库构图、实体 catalog、图生命周期（Phase 4 Wave 0）

### Out of Scope

- v0.1 阶段的用户认证、聊天历史持久化 — 延至 Phase 4
- Phase 1 多 workspace UI — schema 预留，UI Phase 4
- Phase 1–2 Milvus/ES/Neo4j — Phase 3 引入
- 语音 ASR/TTS、定时 Agent、RAGAS — Phase 5 持续迭代
- 全 Serverless 队列（Inngest/Trigger.dev）— 已决策用 BullMQ + Redis

## Context

- **代码基线：** Next.js 16 + React 19 + Vercel AI SDK 6 + Astra DB + OpenRouter（`lib/chat/`）
- **课程参考：** `reference/` 目录（LangGraph、Nest.js、DeepAgents、高级 RAG 等 27 个模块）
- **详细路线图：** [docs/enterprise-roadmap.md](../docs/enterprise-roadmap.md)
- **架构决策（Architect 会话已对齐）：** BullMQ + Redis、PostgreSQL 元数据、Phase 1 保留 `/api/chat`、Phase 2 独立 Nest.js Agent 服务

## Constraints

- **Tech stack:** 保留 Next.js 前端优势；Nest.js 负责 Agent/Worker；不推翻 v0.1 检索链路
- **workspaceId:** Phase 1 Day 1 全链路必填，禁止后期补 schema
- **Deployment:** Web 可继续 Vercel；ingest-worker / agent-service 需常驻进程
- **Simplicity:** Phase 1 Reranker 默认关闭；HyDE/Multi-Query 可选开关

## Key Decisions

| Decision | Rationale | Outcome |
| --- | --- | --- |
| BullMQ + Redis 异步导入 | 重试/进度/死信；与 Phase 3 记忆同栈 | — Pending |
| PostgreSQL 元数据 | 文档 CRUD、ingest 状态、workspace 抽象 | — Pending |
| Phase 1 保留 `/api/chat` | 复用 v0.1；Agent 流量 Phase 2 灰度迁移 | — Pending |
| workspaceId Day 1 落库 | 避免后期洗向量数据 | — Pending |
| Monorepo 结构 | `apps/web` + `apps/ingest-worker` + `apps/agent-service`（Phase 1 末骨架） | — Pending |
| Astra DB 为主向量库 | 延续 v0.1；Phase 3 扩展 Milvus/ES/Neo4j | — Pending |
| VectorStore 抽象层 | 业务层不直接调 Astra SDK | — Pending |
| Phase 1 末 Agent 服务骨架 | Phase 2 平滑迁移，避免同时搞 monorepo + LangGraph | — Pending |

## Current Milestone: v2.0 企业级知识库平台

**Goal:** 构建企业知识库数据层（Phase 1），并逐步引入多 Agent、记忆、生产化能力（Phase 2–5）。

**Target features:**

- 文档自助上传 + BullMQ 异步入库 + 知识库管理 UI
- 聊天引用溯源（citations 卡片）
- workspaceId 全链路隔离
- LangGraph 多 Agent + Skills（Phase 2）
- 记忆 + 多存储 + Agentic RAG（Phase 3）
- Docker Compose + 认证 + 多租户 + 监控（Phase 4）

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-02 after milestone v2.0 initialization*
