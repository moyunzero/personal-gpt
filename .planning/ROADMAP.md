# Roadmap: Personal GPT — v2.0 企业级知识库

## Overview

从 v0.1 RAG 聊天原型出发，分 5 个阶段演进为企业级知识库平台：Phase 1 建立 Monorepo、PostgreSQL 元数据、BullMQ 异步入库、知识库 UI 与引用溯源；Phase 2 引入 Nest.js + LangGraph 多 Agent；Phase 3 补齐记忆与多存储高级 RAG；Phase 4 **Graph KB 产品化（Wave 0）+ 生产化部署与多租户（Wave 1）**；Phase 5 持续优化（语音、评估、成本）。

**详细设计：** [docs/enterprise-roadmap.md](../docs/enterprise-roadmap.md)

## Milestones

- ✅ **v0.1 RAG 聊天原型** — Pre-GDS（已交付）
- ✅ **v1.0 RAG + KB** — Phase 1 封板（2026-07-02）
- ✅ **v2.0 LangGraph 多 Agent** — Phase 2 MVP 关账 + v2.x 加固（2026-08-14；**非生产就绪**）
- 🔜 **v3.0 检索 / 记忆 / 评测** — Phase 3（下一步）
- ⏳ **v4.0 Graph KB + 身份 / 部署** — Phase 4（Wave 0 Graph → Wave 1 PROD）
- ⏳ **v5.0 连接器 / HITL** — Phase 5

> 产品口径与 `README.md` / `docs/enterprise-roadmap.md` 对齐：v2 MVP ≠ 全量 v2.0「企业级可生产」；后者仍依赖 Phase 3–4。

## Phases

- [x] **Phase 1: RAG 基础强化与知识库管理** — Monorepo、BullMQ 入库、KB UI、引用溯源 (completed 2026-07-02)
- [x] **Phase 2: LangGraph 多 Agent 核心架构** — Supervisor + 子 Agent + Skills（MVP 关账 2026-08-12；v2.x 加固 2026-08-14；**非生产就绪**）
- [x] **Phase 3: 记忆、存储与高级 RAG** — Redis/Mem0、Milvus/ES/Neo4j、Agentic RAG（产品口径对齐 v3.0 检索/评测优先）
- [x] **Phase 3.1: 企业级完整意图路由** — Shared Intent Router、Chat/Agent 统一、Graph 硬路由 + Fallback（Phase 3 D-07 Should 落地） (completed 2026-08-22)
- [ ] **Phase 4: Graph KB 产品化 + 生产就绪** — Wave 0 入库构图/实体 catalog；Wave 1 Docker、认证、多租户、监控
- [ ] **Phase 5: 高级企业特性** — 语音、定时 Agent、RAGAS、成本优化（持续）

## Phase Details

### Phase 1: RAG 基础强化与知识库管理

**Goal**: 用户可上传文档、管理知识库、聊天时看到引用来源；workspaceId 全链路就绪。  
**Depends on**: v0.1 基线  
**Requirements**: INFRA-01–03, DATA-01–04, INGEST-01–05, KB-01–04, RAG-01–04, ENG-01–03  
**Reference**: `reference/rag-test`, `typeorm-pg-crud`, `redis-test`, `advanced-rag`, `langsmith-test`

**Success Criteria** (what must be TRUE):

1. 用户上传 10MB PDF 后 90 秒内可在知识库看到 `ready` 状态 → **01-04 must_have + `tests/regression/phase-1/01-upload-pdf.test.ts`**
2. 用户对上传文档提问时，回答下方展示 ≥ 1 条 citation（含相似度）
3. 用户问「你好」时不展示 citation
4. 删除文档后，相关问题不再引用该文档
5. 损坏 PDF 导入失败时，UI 显示可读 error（无需看终端）
6. 100% 新 chunk 带 `workspaceId`；检索 100% 带 filter

**Plans**: 6/7 plans complete（01-07 待执行：KB category/tags UI 补全）

Plans:

- [x] 01-01-PLAN.md
- [x] 01-02-PLAN.md
- [x] 01-03-PLAN.md
- [x] 01-04-PLAN.md
- [x] 01-05-PLAN.md
- [x] 01-06-PLAN.md
- [x] 01-07-PLAN.md — KB category/tags UI 补全（KB-02/KB-03 gap closure）

**Wave 1**

- [x] 01-01: Monorepo 脚手架 + Docker Compose（PG + Redis）+ packages/shared

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02: PostgreSQL schema（workspaceId Day 1）+ VectorStore 抽象 + Astra 实现

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03: BullMQ ingest pipeline（Loader → Splitter → embed → upsert）

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04: KB 管理 API + `/kb` UI（列表、上传、进度、CRUD）

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-05: Citations 返回前端 + 引用卡片 UI + 智能检索升级

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-06: LangSmith 追踪 + Phase 1 回归测试集 + agent-service 透传骨架

**Wave 7** *(blocked on Wave 4 completion — gap closure 2026-07-03)*

- [x] 01-07: KB category/tags UI 补全（上传元数据、行内编辑、filter datalist + 单测）

**Regression**: `tests/regression/phase-1/`（5 用例，PR 必跑）

**Known gap (post-verification):** 混库场景下用户文档召回精度 — 见 [`docs/issues/ISSUE-001-mixed-corpus-recall.md`](../docs/issues/ISSUE-001-mixed-corpus-recall.md)（不在 Phase 1 原 Success Criteria 内）

---

### Phase 2: LangGraph 多 Agent 核心架构

**Goal**: 复杂任务（如「调研竞品并生成报告」）自动分解，多 Agent 协作流式输出。  
**Depends on**: Phase 1（agent-service 骨架、LangSmith 项目、Phase 1 回归全绿）  
**Requirements**: AGENT-01–05  
**Reference**: `reference/langgraph-test`, `deep-research-assistant`, `agui-backend`, `agui-frontend`

**Risks**: Token 消耗 3–10×、调试复杂度上升 → LangSmith trace 必开、简单问答仍走 `/api/chat`

**Success Criteria**:

1. 标准调研任务（5 案例）成功率 ≥ 75%，产出可用 Markdown 报告
2. 首步流式输出 < 3s
3. LangSmith 可看到完整 Agent 图执行与 token 统计
4. KB 相关问题触发 Retriever Agent，citation 来自 workspace 知识库
5. 纯闲聊不启动完整多 Agent 流程

**Plans**: 5/5 plans complete（MVP；非生产就绪）

Plans:

- [x] 02-00-PLAN.md — Wave 0：依赖 pin、Vitest/CI、phase-2 回归骨架、shared agent 类型
- [x] 02-01-PLAN.md — LangGraph 外层短路 + Supervisor + MemorySaver + recursionLimit
- [x] 02-02-PLAN.md — 子 Agent（Retriever / Researcher / Analyst / Editor）+ 工具与降级
- [x] 02-03-PLAN.md — Skills 机制（kb-retrieval / web-research / report-writer）
- [x] 02-04-PLAN.md — Agent SSE API + 前端方案 A 模式切换与步骤面板（+ v2.x BFF / Sequential）

**Closeout**: `tests/acceptance/phase-2-agent/CLOSEOUT.md` · `02-04-SUMMARY.md`  
**Regression**: `tests/regression/phase-2/`（mock）+ `yarn acceptance:phase-2-smoke`（live）

**Known gap (post-MVP):** 正式鉴权 / agent Docker / Postgres checkpointer / 生产成功率门禁 — 见 `docs/enterprise-roadmap.md`「v2.x → 后续版本」

---

### Phase 3: 记忆、存储与高级 RAG

**Goal**: 跨会话记忆、多存储后端、Agentic RAG 与 Graph RAG；全并集关账（质量→记忆→多存储→Graph，约 5–8 周）。  
**Depends on**: Phase 2  
**Requirements**: MEM-01–02, STORE-01, RAG-05–06, GOLDEN-01, CP-01, CORPUS-01  
**Reference**: `reference/memory-test`, `mem0-test`, `milvus-test`, `es-test`, `neo4j-graphrag`

**Notes（D-04 / D-06）**:

- 与 `docs/enterprise-roadmap.md` v3.0 **双写同一全并集与四 wave**；Graph / Milvus 均为 Milestone-required。
- **D-06 书面降级协议**：Mem0（或同类外部记忆 provider）不可用时，等待 **7 自然日** 后须开发者确认，方可降为「接口 + mock/旁路 + 已知缺口」；**不得**默默删除 Success Criteria。
- **D-07 Should**（不挡关账）：Prompt registry、结构化工具返回、prompt 外置、Intent 增强、`file_read`/`report_generate`。
- REQ 注意：Phase 3 用 `GOLDEN-01`（黄金集 smoke）；**不要**把 Phase 5 `EVAL-01`（RAGAS）写成 Phase 3 需求。

**Success Criteria**:

1. 会话 A 声明偏好后，会话 B 可召回该偏好（Redis + Mem0）
2. 多跳问题触发 Agent 多轮 `kb_search` + 管道内 Corrective 并给出正确答案
3. 混合检索（向量 + ES BM25 + app-layer RRF）+ 默认 Rerank 提升专有名词文档排名
4. Graph RAG 实体关系问题可 trace Neo4j 路径（**demo 级**：seed 子图 + allowlist；应用级 Graph KB → Phase 4 GRAPH-01–04）
5. workspace A/B 同名文档检索结果不交叉；corpus=user 时 citation 不得出现 psychology-qa（ISSUE-001 Closed）
6. Postgres checkpointer 单实例同 `thread_id` 可恢复；Chat/Agent 共用 `packages/shared` hybrid 入口
7. 黄金集 ≥20（nightly）+ `tests/regression/phase-3/` 全绿

**Plans**: 10/10 plans complete

Plans:

- [x] 03-00-PLAN.md — Wave 0a：D-04/D-06 双写文档 + GOLDEN-01/CP-01/CORPUS-01
- [x] 03-00b-PLAN.md — Wave 0b：Nyquist 回归/单测骨架 + migrate dry-run + scripts
- [x] 03-01-PLAN.md — Wave1a：ES Compose + shared RRF/hybrid/BM25/corpus
- [x] 03-02-PLAN.md — Wave1b：Ingest 双写 ES + Astra 分 collection + 迁移脚本
- [x] 03-03-PLAN.md — Wave1c wiring：Corrective + 默认 Rerank + Chat/Agent 接线 + RAG-05 multi-hop
- [x] 03-03b-PLAN.md — Wave1c gate：回归 01/02 + ISSUE-001 Closed + GOLDEN-01 smoke
- [x] 03-04-PLAN.md — Wave2a：Redis 短期 + Mem0 长期记忆注入
- [x] 03-05-PLAN.md — Wave2b：Postgres checkpointer 默认 + thread_id 分模持久化
- [x] 03-06-PLAN.md — Wave3：Milvus VectorStore + factory + workspace 隔离回归
- [x] 03-07-PLAN.md — Wave4：Neo4j Graph RAG + Milestone 全并集关账

**Regression**: `tests/regression/phase-3/`（01–06）+ Phase 1–2 + `yarn eval:phase-3`

---

### Phase 3.1: 企业级完整意图路由

**Goal**: Chat 与 Agent 共用 `packages/shared` Intent Router；实体关系问题 **确定性** 走 `graph_search`；KB 无命中自动 graph fallback；消灭 Supervisor 对单 intent 任务的直答漏路由。  
**Depends on**: Phase 3（Graph RAG + hybrid + Agent 多 Agent 骨架）  
**Requirements**: ROUTE-01–05, AGENT-01（路由增强）；RAG-06 仅 demo Graph 管道（应用级 → Phase 4）  
**Reference**: Phase 3 H-04 gap、`apps/web/lib/chat/query-router.ts`、`apps/agent-service/src/agents/supervisor.prompt.ts`

**Success Criteria**:

1. 「珍珠奶茶有哪些原料，用了什么工艺？」在 Agent UI trace 中 **必见** `graph_search` 且返回 `GRAPH_SEARCH_STATUS: HIT`
2. Chat 与 Agent 共用 `packages/shared/src/routing/` 的 `IntentPlan` 类型与 L0/L1 规则（无平行 duplicate 路由）
3. `graph_relation` intent 下 Retriever **仅** 绑定 `graph_search`（tool 白名单 enforced）
4. KB `NO_RELEVANT_HIT` 且 fallback 启用时，服务端自动尝试 `graph_search`（非 prompt 建议）
5. `tests/regression/phase-3/07-intent-routing.test.ts` 全绿 + Phase 1–3 既有回归不回归失败

**Plans**: 3/3 plans complete

Plans:

- [x] 03.1-01-PLAN.md — Wave 1: shared routing kernel（IntentPlan、L0/L1/L3、D-12 专科顺序、D-14 L2 默认关、D-16 灰区）
- [x] 03.1-02-PLAN.md — Wave 2: Agent 集成（D-11 prefetch+Retriever、D-13 条件 fallback、D-15 双层 trace、白名单）
- [x] 03.1-03-PLAN.md — Wave 3: Chat 薄包装 + D-07 图谱路径卡片 + 回归 07 + golden + H-04 关账

**Regression**: `tests/regression/phase-3/07-intent-routing.test.ts` + Phase 1–3 全量

---

### Phase 4: Graph KB 产品化 + 生产就绪

**Goal**: 将 Phase 3 **demo 级** Neo4j 子图升级为 **从用户文档自动构图** 的应用级 Graph KB（Wave 0）；完成后执行 `docker compose up` 一键部署、多租户认证与可观测（Wave 1）。  
**Depends on**: Phase 3.1（Intent Router + graph_search 管道）  
**Requirements**: GRAPH-01–04（Wave 0）, PROD-01–05（Wave 1）  
**Reference**: `reference/neo4j-graphrag`, `reference/nest-dockerfile-test`, `nest-feature`  
**Context**: [phases/PGPT-04-prod/04-CONTEXT.md](phases/PGPT-04-prod/04-CONTEXT.md)

**Notes**:

- Phase 3 **RAG-06** 关账范围 = hybrid + **demo** Graph RAG（珍珠奶茶 seed）；**不**等同于应用级 Graph KB。
- Wave 0 **不**默认 LLM Text2Cypher；Cypher 模板 + allowlist（Text2Cypher 留 Phase 5 spike）。
- Wave 0 可用现有 `workspaceId` 做逻辑隔离；Wave 1 Auth 关账时验收 **KB + ES + Neo4j** 三通道零泄漏。

**Success Criteria**:

*Wave 0 — Graph KB*

1. 用户上传文档后 Neo4j 出现 **非 seed** 实体/关系，且 `graph_search` 可 HIT
2. workspace 内自建实体的关系型问法 → graph 路由/fallback **不依赖** `graph-entities.ts` 硬编码
3. 删文档/重索引后图数据同步；workspace A/B 图与 KB 均不交叉
4. Chat 图谱卡片 + Agent trace 仍满足 3.1 graph HIT 可观测性

*Wave 1 — 生产就绪*

5. 全新环境 `docker compose up` 后 5 分钟内可聊天 + 上传 + graph 检索
6. 用户 A 文档/图对用户 B 不可见（零 cross-tenant 泄漏）
7. 触发限流返回 429 + 可读提示
8. Prometheus 可 scrape agent/chat/ingest 指标
9. Phase 1–3.1 + Phase 4 回归套件 CI 全绿

**Plans**: 6 plans（Wave 0 优先）

Plans:

*Wave 0 — Graph KB 产品化*

- [ ] 04-00: Ingest 构图 MVP — chunk → 实体/关系抽取 → Neo4j upsert（`workspaceId` + `documentId`）
- [ ] 04-01: Workspace 实体 catalog + 路由（替换 seed regex；L1 实体链接）
- [ ] 04-02: Cypher 模板库 + `graph-rag` 多路径查询（allowlist 保留）
- [ ] 04-03: 删/重索引图同步 + `tests/regression/phase-4/` graph 回归

*Wave 1 — 生产就绪（原 Phase 4）*

- [ ] 04-04: Docker Compose 全栈 + 健康检查 + 会话历史持久化
- [ ] 04-05: Clerk/Auth.js + workspace 成员角色 + **三通道**隔离验收
- [ ] 04-06: 限流审计 + Prometheus/Grafana + CI/CD

**Regression**: `tests/regression/phase-4/`（graph + 生产冒烟 + 全阶段）

---

### Phase 5: 高级企业特性（持续）

**Goal**: 语音、定时 Agent、RAGAS 评估、团队协作、成本优化；可选 **LLM Text2Cypher** / GraphRAG 社区 spike。  
**Depends on**: Phase 4  
**Requirements**: v2.1+（VOICE-01, CRON-01, EVAL-01, TEAM-01, COST-01）+ Text2Cypher spike（非 v2.0 硬需求）  
**Reference**: `reference/asr-and-tts-nest-service`, `cron-job-tool`, `langsmith-test/src/eval/`

**Success Criteria**:

1. RAGAS 评估纳入 CI nightly
2. 每次新增 Skill/Tool 补充 ≥ 2 个 eval case
3. Phase 1–4 回归用例持续维护全绿

**Plans**: TBD（按优先级迭代）

Plans:

- [ ] 05-01: TBD — 首个 Phase 5 迭代计划待 Phase 4 完成后定义

**Regression**: RAGAS + Phase 1–4 人工回归并入 CI nightly

---

## Progress

**Execution Order:** Phases 1 → 2 → 3 → 4 → 5

| Phase | Milestone | Plans Complete | Status | Completed |
| --- | --- | --- | --- | --- |
| 1. RAG + KB 管理 | v2.0 | 7/7 | Complete | 2026-07-02 |
| 2. LangGraph 多 Agent | v2.0 | 5/5 | MVP Complete（非生产） | 2026-08-14 |
| 3. 记忆 + 高级 RAG | v2.0 / v3.0 | 10/10 | Complete   | 2026-08-22 |
| 3.1 意图路由 | v3.0 | 3/3 | Complete    | 2026-08-22 |
| 4. Graph KB + 生产就绪 | v2.0 / v4.0 | 0/6 | Not started（Wave 0 优先） | — |
| 5. 企业特性 | v2.0 / v5.0 | 0/1 | Not started | — |

**Total plans:** 28 (+ Phase 5 TBD) · **Executed:** Phase 1–3.1 complete · **Phase 4 planned:** 6（04-00～04-03 Graph → 04-04～04-06 PROD）

---
*Roadmap created: 2026-07-02 after milestone v2.0 initialization*
