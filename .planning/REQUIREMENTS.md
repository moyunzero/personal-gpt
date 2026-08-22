# Requirements: Personal GPT — v2.0 企业级知识库

**Defined:** 2026-07-02  
**Milestone:** v2.0  
**Core Value:** 用户能上传企业文档、基于自有知识库获得可溯源的准确回答

## v2.0 Requirements

### Infrastructure（基础设施）

- [x] **INFRA-01**: Monorepo 包含 `apps/web`、`apps/ingest-worker`、`packages/shared`
- [x] **INFRA-02**: Docker Compose 提供 PostgreSQL + Redis 开发环境
- [x] **INFRA-03**: `packages/shared` 提供 KB 类型、env Zod schema、ingest 工具配置

### Data Layer（数据层）

- [x] **DATA-01**: PostgreSQL schema 含 `workspaces`、`documents`、`ingest_jobs`，全部带 `workspace_id`
- [x] **DATA-02**: Astra chunk 元数据写入时必填 `workspaceId`
- [x] **DATA-03**: 检索链路强制 `workspaceId` 过滤，缺省 reject
- [x] **DATA-04**: `VectorStore` 接口 + Astra 实现（upsert / delete / search）

### Document Ingest（文档导入）

- [x] **INGEST-01**: 用户可通过 API 上传 PDF、Markdown、TXT、Word（.docx）
- [x] **INGEST-02**: BullMQ 异步 pipeline：parse → split → embed → upsert → 更新 PG 状态
- [x] **INGEST-03**: 导入进度可查询（0–100%），失败可重试并展示 error
- [x] **INGEST-04**: 用户可删除文档并同步清除 PG + Astra chunks
- [x] **INGEST-05**: 用户可对文档触发重新索引

### Knowledge Base Management（知识库管理）

- [x] **KB-01**: 用户可在 `/kb` 查看文档列表（标题、状态、chunk 数、上传时间）
- [x] **KB-02**: 用户可编辑文档元数据（title、category、tags）
- [x] **KB-03**: 用户可按 category/tags/状态过滤和搜索文档
- [x] **KB-04**: 用户可拖拽上传文件并看到导入进度

### RAG & Citations（检索与引用）

- [x] **RAG-01**: 知识类问题回答时 `/api/chat` 返回 `citations[]`（title、source、similarity、snippet）
- [x] **RAG-02**: 聊天 UI 在回答下方展示可折叠引用卡片
- [x] **RAG-03**: 闲聊不触发向量检索且无 citation
- [x] **RAG-04**: 智能检索判断结合 embedding 预检（可选 HyDE / Multi-Query / Reranker 开关）

### Engineering（工程化）

- [x] **ENG-01**: LangSmith 追踪 ingest 与检索链路
- [x] **ENG-02**: Phase 1 回归测试集（5 用例）纳入 CI
- [x] **ENG-03**: `apps/agent-service` 骨架：`POST /agent/chat` 透传代理至 `/api/chat`

### Multi-Agent（多 Agent — Phase 2）

- [x] **AGENT-01**: LangGraph StateGraph + Supervisor 任务分解与路由
- [x] **AGENT-02**: Retriever / Researcher / Analyst / Editor 子 Agent 协作
- [x] **AGENT-03**: Skills 机制：`skills/<name>/SKILL.md` 动态加载
- [x] **AGENT-04**: Agent SSE API 兼容 Vercel AI SDK 流式格式
- [x] **AGENT-05**: 前端 Agent 模式展示子 Agent 执行步骤与 todo 进度

### Memory & Advanced Storage（记忆与存储 — Phase 3）

- [x] **MEM-01**: Redis 短期会话记忆
- [x] **MEM-02**: 长期记忆（Mem0 或自研分层）跨会话召回
- [x] **STORE-01**: 多存储抽象：Milvus（向量）、ElasticSearch（全文）、Neo4j（图谱）
- [x] **RAG-05**: Agentic RAG — Agent 决定检索策略与次数
- [x] **RAG-06**: 混合检索（向量 + BM25）与 Graph RAG（**Phase 3 关账 = demo 级**：seed 子图 + allowlist；应用级 Graph KB → Phase 4 GRAPH-01–04）
- [x] **GOLDEN-01**: Phase 3 黄金集 ≥20 + CI deterministic smoke（`yarn eval:phase-3`）；非 RAGAS（RAGAS 仍为 Phase 5 EVAL-01）
- [x] **CP-01**: Postgres checkpointer 单实例同 thread_id 可恢复
- [x] **CORPUS-01**: 物理 user/seed 分库 + 默认 corpus=user + ISSUE-001 Closed

### Intent Routing（意图路由 — Phase 3.1）

- [x] **ROUTE-01**: Shared Intent Router（`packages/shared/routing`）— Chat/Agent 共用 IntentPlan + L0/L1 规则
- [x] **ROUTE-02**: Agent 确定性路由 — tool 白名单、single_specialist、KB→Graph fallback、trace 可观测
- [x] **ROUTE-03**: Chat shared router + graph inject + 可折叠「图谱路径」卡片
- [x] **ROUTE-04**: KB miss → graph fallback（Chat + Agent 共用 fallbackChain）
- [x] **ROUTE-05**: Agent Synthesizer 成文层（retrieve → rag_generate，对齐 enterprise 模式）

### Graph Knowledge Base（Graph KB — Phase 4 Wave 0）

- [ ] **GRAPH-01**: Ingest 构图 — 文档入库时抽取实体/关系写入 Neo4j（绑 `workspaceId` + `documentId`）
- [ ] **GRAPH-02**: Workspace 实体 catalog — 路由 L0/L1 实体链接替换 `graph-entities.ts` seed
- [ ] **GRAPH-03**: Cypher 模板库 — 多路径 allowlist 查询；Phase 4 不默认 LLM Text2Cypher
- [ ] **GRAPH-04**: 图生命周期 — 删文档/重索引同步清理或重建图，与 KB chunk 一致

### Production（生产就绪 — Phase 4 Wave 1）

- [ ] **PROD-01**: Docker Compose 一键启动 web + agent + ingest + PG + Redis + MinIO + **Neo4j**
- [ ] **PROD-02**: 用户认证（Clerk 或 Auth.js）+ workspace 成员/角色
- [ ] **PROD-03**: 多租户隔离验证 — 跨 workspace 零泄漏（**向量 + ES + Neo4j** 三通道）
- [ ] **PROD-04**: 限流、操作审计日志
- [ ] **PROD-05**: Prometheus + Grafana 监控 + CI/CD

## v2.1+ Requirements（Phase 5 — 持续）

### Enterprise Enhancements

- **VOICE-01**: ASR + TTS 语音交互
- **CRON-01**: 定时 Agent + 邮件通知
- **EVAL-01**: RAGAS 自动评估 + 人工反馈循环
- **TEAM-01**: 团队协作（共享知识库、@ 提及）
- **COST-01**: 语义缓存、模型路由、Token 预算控制

## Out of Scope

| Feature | Reason |
| --- | --- |
| 全 Serverless 队列（Inngest） | 已决策 BullMQ + Redis，与 Nest Worker 同栈 |
| Phase 1 多 workspace UI | schema 预留，认证/UI Phase 4 |
| Phase 1–2 Milvus/ES/Neo4j | Phase 3 存储扩展阶段引入 |
| Phase 3 demo Graph（seed 子图） | Phase 3 RAG-06 关账；应用级 Graph KB → Phase 4 GRAPH-01–04 |
| LLM Text2Cypher / GraphRAG 社区 | Phase 5 spike |
| Phase 1 Reranker 默认开启 | 降低复杂度，作为可选开关 |
| 实时协作编辑 | 非核心，Phase 5+ 探索 |

## Traceability

| Requirement | Phase | Status |
| --- | --- | --- |
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| INGEST-01 | Phase 1 | Complete |
| INGEST-02 | Phase 1 | Complete |
| INGEST-03 | Phase 1 | Complete |
| INGEST-04 | Phase 1 | Complete |
| INGEST-05 | Phase 1 | Complete |
| KB-01 | Phase 1 | Complete |
| KB-02 | Phase 1 | Complete |
| KB-03 | Phase 1 | Complete |
| KB-04 | Phase 1 | Complete |
| RAG-01 | Phase 1 | Complete |
| RAG-02 | Phase 1 | Complete |
| RAG-03 | Phase 1 | Complete |
| RAG-04 | Phase 1 | Complete |
| ENG-01 | Phase 1 | Complete |
| ENG-02 | Phase 1 | Complete |
| ENG-03 | Phase 1 | Complete |
| AGENT-01 | Phase 2 | Complete |
| AGENT-02 | Phase 2 | Complete |
| AGENT-03 | Phase 2 | Complete |
| AGENT-04 | Phase 2 | Complete |
| AGENT-05 | Phase 2 | Complete |
| MEM-01 | Phase 3 | Complete |
| MEM-02 | Phase 3 | Complete |
| STORE-01 | Phase 3 | Complete |
| RAG-05 | Phase 3 | Complete |
| RAG-06 | Phase 3 | Complete（demo Graph RAG；应用级 → GRAPH-01–04） |
| GOLDEN-01 | Phase 3 | Complete |
| CP-01 | Phase 3 | Complete |
| CORPUS-01 | Phase 3 | Complete |
| ROUTE-01 | Phase 3.1 | Complete |
| ROUTE-02 | Phase 3.1 | Complete |
| ROUTE-03 | Phase 3.1 | Complete |
| ROUTE-04 | Phase 3.1 | Complete |
| ROUTE-05 | Phase 3.1 | Complete |
| GRAPH-01 | Phase 4 | Pending |
| GRAPH-02 | Phase 4 | Pending |
| GRAPH-03 | Phase 4 | Pending |
| GRAPH-04 | Phase 4 | Pending |
| PROD-01 | Phase 4 | Pending |
| PROD-02 | Phase 4 | Pending |
| PROD-03 | Phase 4 | Pending |
| PROD-04 | Phase 4 | Pending |
| PROD-05 | Phase 4 | Pending |

**Coverage:**

- v2.0 requirements: 42 total（+ GRAPH-01–04, ROUTE-03–05 正式入表）
- Mapped to phases: 42
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-02*  
*Last updated: 2026-08-22 — Phase 4 扩展：GRAPH-01–04（Wave 0 Graph KB）；RAG-06 标注 demo vs 应用级边界；PROD-03 三通道隔离*
