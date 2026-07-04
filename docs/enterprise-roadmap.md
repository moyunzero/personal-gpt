# Personal GPT — 企业级知识库产品路线图

> **基线**：v0.1 RAG 聊天原型（已完成）  
> **愿景**：从个人 RAG 原型演进为**可生产、多租户、可观测**的企业级知识库 + 多 Agent 协作平台  
> **参考**：`reference/` 目录（ai-agent-course 课程实战代码）  
> **最后更新**：2026-07-03

### 版本对照

| 版本 | 主题 | 状态 |
| --- | --- | --- |
| **v0.1** | RAG 聊天原型 | ✅ 已完成 |
| **v1.0** | RAG 强化 + 企业知识库 | ✅ 已封板 |
| **v2.0** | LangGraph 多 Agent | 🔜 规划中 |
| **v3.0** | 记忆、多存储、高级 RAG | 规划中 |
| **v4.0** | 工程化与生产就绪 | 规划中 |
| **v5.0** | 高级企业特性 | 持续演进 |

---

## v1.0 状态（2026-07-03）

**结论：核心功能已封板 ✅**（验收 8/8、回归 8/8、`yarn validate` 通过）

| 类别 | 状态 |
| --- | --- |
| 基础设施 / 数据层 / 导入 Pipeline / KB API+UI | ✅ 已完成 |
| RAG 引用 + 三层 query-router | ✅ 已完成 |
| HyDE / Multi-Query / Reranker | ⚪ 可选开关（默认关） |
| LangSmith | 🟡 代码就绪，需配置 `LANGSMITH_*` |
| SemanticChunker | ⏸ v1.0 延期至 v3.0 |
| MinIO 对象存储 | ⏸ v1.0 用本地 `uploads/`，S3/MinIO 见 v4.0 |
| agent-service Docker 镜像 | ⏸ 本地 `yarn dev:agent`，容器化见 v4.0 |
| `seed:psychology` 全量导入 | 🟡 支持断点续跑，需 Google API 配额 |

---

## Blueprint 摘要

### 已对齐的术语

| 术语 | 定义 |
| --- | --- |
| 企业级知识库 | 文档自助导入/管理、检索可溯源、workspace 隔离、可观测可部署的后端系统 |
| Knowledge Base | 一个 workspace 下的文档集合（元数据 + 向量 chunks），检索强制按 workspaceId 过滤 |
| Agent 服务 | v2.0 起独立 Nest.js 服务，运行 LangGraph、多 Agent、Skills；Next.js 通过 SSE 消费 |
| Skills | `skills/<name>/SKILL.md` + Tool 实现，Supervisor/LLM 动态加载 |
| 可生产 | v4.0 集中落地；v1.0–v3.0 逐步铺垫队列、追踪、配置化 |

### 已做决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 异步文档处理 | **BullMQ + Redis** | 与 v3.0 短期记忆、v4.0 Worker 同栈；支持重试/进度/死信；参考 `reference/redis-test` |
| v1.0 聊天链路 | **保留 Next.js `/api/chat`** | 复用 v0.1 投资；Agent 流量 v2.0 起逐步迁移 |
| 元数据存储 | **PostgreSQL**（v1.0 引入） | 文档 CRUD、导入任务状态、workspace 抽象；参考 `reference/typeorm-pg-crud` |
| 向量存储（v1.0–v2.0） | **Astra DB 为主** | 延续 v0.1；v3.0 再扩展 Milvus / ES / Neo4j |
| 仓库结构 | **Monorepo** | `apps/web` + `apps/ingest-worker` + `apps/agent-service`（v1.0 末搭骨架） |
| workspaceId | **v1.0 首日即落库** | PG / Astra / API 全链路带 `workspaceId`，运行时默认 `default`，避免后期 schema 迁移 |

### 假设（v1.0 已确认）

- v1.0 使用**单 workspace 默认租户**（`default`），**Day 1 所有表与 Astra metadata 含 `workspaceId`**；v4.0 再接 Clerk/Auth.js
- 文件对象存储 v1.0 用**本地磁盘**（`uploads/`），MinIO/S3 见 v4.0；参考 `reference/oss-test`
- Reranker v1.0 为**可选开关**（Cross-Encoder 或 LLM rerank），默认关闭以降低复杂度

---

## 目标架构演进

```text
v1.0                             v2.0                            v4.0
────────                         ───────                         ───────

┌─────────────┐                  ┌─────────────┐                 ┌─────────────┐
│  apps/web   │                  │  apps/web   │                 │  apps/web   │
│  Next.js    │                  │  Next.js    │                 │  Next.js    │
│  聊天+KB UI │                  │  +Agent UI  │                 │  工作台     │
└──────┬──────┘                  └──────┬──────┘                 └──────┬──────┘
       │ /api/chat                      │ SSE                           │
       │ /api/kb/*                      ▼                               │
       ▼                         ┌─────────────┐                          │
┌─────────────┐                  │ agent-svc   │◄───────────────────────────┘
│ingest-worker│                  │ Nest.js     │
│ BullMQ      │                  │ LangGraph   │
└──────┬──────┘                  └──────┬──────┘
       │                                │
       ▼                                ▼
┌──────────────────────────────────────────────────┐
│ Redis │ PostgreSQL │ Astra DB │ (v3.0+: ES…) │
└──────────────────────────────────────────────────┘
```

---

## v0.1 - RAG 聊天原型（已完成）

详见 [README](../README.md#v01---rag-聊天原型已完成)。

**可复用资产**：

| 模块 | 路径 | 后续用途 |
| --- | --- | --- |
| 检索链路 | `lib/chat/retrieve.ts` | v1.0 RAG 增强基座 |
| 智能判断 | `lib/chat/query-router.ts` | 快速规则 + LLM 路由（direct / retrieve） |
| 上下文打包 | `lib/chat/context.ts` | 引用元数据返回前端 |
| 导入脚本 | `script/loadDB.ts`, `loadPromptSuggestions.ts` | 迁移为运行时 Ingest Pipeline |
| 环境校验 | `lib/env.ts` | 扩展 Zod schema |

---

## 跨版本公共模块（尽早抽象）

在 `packages/shared` 中 **v1.0 起步即创建**，避免各 app 重复定义、后期拆包痛苦：

| 路径 | 内容 | 引入版本 |
| --- | --- | --- |
| `types/kb.ts` | `Document`、`Chunk`、`Citation`、`IngestJob`、`WorkspaceId` | v1.0 Day 1 |
| `types/agent.ts` | `AgentState`、`TodoItem`、`AgentStepEvent`（v2.0 用，先占位） | v1.0 末 |
| `utils/ingest.ts` | Splitter 默认配置、chunk 大小、overlap、MIME → Loader 映射 | v1.0 |
| `stores/vector-store.ts` | `VectorStore` 接口：`upsert`、`deleteByDocument`、`search(filter)` | v1.0 |
| `stores/vector-store.astra.ts` | Astra DB 实现（v3.0 加 `milvus` 实现） | v1.0 |
| `schemas/env.ts` | 各 app 共享 Zod env schema | v1.0 |

**原则**：检索、入库、Agent RAG 均通过 `VectorStore` 接口访问向量库，不在业务层直接调 Astra SDK。

---

## v1.0 - RAG 基础强化与知识库管理（1–2 周，已封板 ✅）

### 目标

让 v0.1 个人 RAG 具备**企业知识库数据层**：用户可上传文档、管理知识库、聊天时可看到引用来源。

### 具体任务

#### 仓库与基础设施

- [x] 初始化 monorepo：`apps/web`（迁移现有 Next.js）、`apps/ingest-worker`（Nest.js）
- [x] Docker Compose：`postgres`、`redis`（开发环境）
- [x] 共享包 `packages/shared`：类型、Zod schema、env 常量
- [x] 扩展 `lib/env.ts` → 各 app 统一 Zod 校验（Astra、Google AI、Redis、PG）

**Reference**：`reference/nest-dockerfile-test`、`reference/pgsql-test`、`reference/redis-test`

#### 数据模型（PostgreSQL + Astra）

> **⚠️ workspaceId 首日必做**：v1.0 虽只用 `default` workspace，但 **PG 表、Astra metadata、检索 filter、API 请求上下文** 从第一次 migration 起就必须带 `workspaceId`。禁止「先不加、v4.0 再补」——后期改 schema + 洗向量数据成本极高。

**PostgreSQL 表**（TypeORM，**第一次 migration 即包含**）：

```text
workspaces       id (uuid), slug ('default'), name, created_at
documents        id, workspace_id (FK, NOT NULL), title, source, category, tags[], owner,
                 status (pending|processing|ready|failed), chunk_count,
                 file_path, mime_type, created_at, updated_at
ingest_jobs      id, workspace_id (FK, NOT NULL), document_id, status, progress,
                 error, bull_job_id, created_at
```

**Astra chunk 元数据**（每条向量记录，**写入时必填**）：

```text
workspaceId, documentId, chunkIndex, title, source, category, tags, text
```

- [x] 种子数据：`INSERT workspaces (slug='default')` + migration 中 `DEFAULT workspace_id`
- [x] 检索链路 **强制 `workspaceId` 过滤**（缺省则 reject，不允许全库扫描）
- [x] 迁移现有 `seed:suggestions` 数据时写入 `workspaceId: 'default'`（Gemini 3072 维 collection）

**Reference**：`reference/typeorm-pg-crud`

#### 文档导入 Pipeline

- [x] **支持格式**：PDF、Markdown、TXT、Word（`.docx`）
- [x] **DocumentLoader**（LangChain `@langchain/community`）：
  - PDF → `PDFLoader`
  - MD/TXT → `TextLoader`
  - Word → `DocxLoader`
- [x] **TextSplitter**：
  - 默认 `RecursiveCharacterTextSplitter`（chunk 800–1000，overlap 100）
  - [ ] 可选 `SemanticChunker`（延期 v3.0）
- [x] **异步队列**：BullMQ `ingest` queue
  - Job 步骤：`parse → split → embed → upsert-astra → update-pg`
  - 进度：0→25→50→75→100，写入 `ingest_jobs.progress`
  - 失败：重试 3 次 + 死信 + 错误信息落库
- [x] **对象存储**：上传文件存本地 `uploads/`，PG 存路径（MinIO 延期 v4.0）

**Reference**：`reference/rag-test`（splitters）、`reference/oss-test`

#### 知识库管理 API + UI

**API**（Next.js Route Handlers）— 均已实现：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/kb/documents` | 上传文件，创建 document + 入队 |
| GET | `/api/kb/documents` | 列表（分页、按 category/tags 过滤） |
| GET | `/api/kb/documents/:id` | 详情 + ingest 状态 |
| PATCH | `/api/kb/documents/:id` | 编辑元数据 |
| DELETE | `/api/kb/documents/:id` | 删 PG + Astra chunks |
| POST | `/api/kb/documents/:id/reindex` | 重新切块入库 |
| GET | `/api/kb/jobs/:id` | 导入进度（JSON 轮询） |
| GET | `/api/kb/jobs/:id/stream` | 导入进度（SSE，UI 默认使用） |

**UI 页面** `/kb` — 均已实现：

- 文档列表：标题、来源、chunk 数、上传时间、状态徽章
- 上传区：拖拽 + 格式提示 + 大小限制（如 20MB）
- 操作：删除、重新索引、编辑 tags/category
- 搜索过滤：标题、tags、状态

#### RAG 增强

- [x] **引用返回前端**：`/api/chat` SSE `data-citations` 事件
- [x] **引用 UI**：`CitationCards` 组件
- [x] **检索策略（可选开关）**：
  - HyDE：`ENABLE_HYDE`
  - Multi-Query：`ENABLE_MULTI_QUERY`
  - Reranker：`ENABLE_RERANKER`（LLM 语义重排）
- [x] **智能判断升级**：`query-router.ts` — `query-intent` + embedding 预检 + LLM 二分类

**Reference**：`reference/advanced-rag/src/rag-query-router.mjs`、`rag-multihop.mjs`

#### 工程化

- [x] LangSmith 追踪：检索 + ingest pipeline（`tracing.ts`，需 `LANGSMITH_API_KEY`）
- [x] 结构化日志：`requestId`、`documentId`、`workspaceId`
- [x] Vitest：ingest 单元测试、chat/KB 集成测试、v1.0 回归集
- [x] GitHub Actions：web + ingest-worker + agent-service validate + regression

**Reference**：`reference/langsmith-test`

#### Agent 服务骨架（v1.0 末，为 v2.0 铺路）

> v1.0 **最后 1–2 天**搭建空壳，v2.0 只填 LangGraph 逻辑，避免届时同时搞 monorepo + 新服务 + 图编排。

- [x] 新建 `apps/agent-service`（Nest.js）：`POST /agent/chat` 透传 → Next.js `/api/chat`
- [x] 模块空壳：`agents/`、`rag/`、`tools/`、`skills/`、`graph/`（占位 README）
- [x] SSE 响应格式与 Vercel AI SDK 对齐（pipe 透传）
- [ ] Docker Compose 加入 `agent-service` 容器（延期 v4.0；本地用 `yarn dev:agent`）
- [x] 环境变量预留：`LANGSMITH_API_KEY`、`LANGSMITH_PROJECT`、`WEB_URL`、`AGENT_SERVICE_PORT`

**Reference**：`reference/hello-nest-langchain`、`reference/agui-backend`

### 预期成果

- 用户可在 UI 上传 PDF/MD/TXT/Word，看到导入进度
- 知识库可 CRUD、重新索引
- 聊天回答下方展示引用来源（标题、相似度、片段）
- 开发者可用 LangSmith 追踪单次问答的检索链路

### 成功指标

| 指标 | 目标 |
| --- | --- |
| 平均导入时间 | **< 90 秒**（10MB PDF，含 embed + upsert） |
| 引用展示率 | 知识类问题 **≥ 85%** 展示 ≥ 1 条引用 |
| 导入失败可定位 | UI 显示 error message，无需看终端 |
| workspaceId 覆盖 | 100% 新写入 chunk 带 `workspaceId`；检索 100% 带 filter |

### 回归测试集（v1.0 末冻结）

`tests/regression/phase-1/`（v1.0 回归集，目录名保留兼容）— 每次 v1.0 相关 PR 必跑：

| # | 用例 | 期望 |
| --- | --- | --- |
| 1 | 上传 PDF → 等待完成 | status=`ready`，chunk_count > 0 |
| 2 | 对上传文档提相关问题 | 回答含 ≥ 1 条 citation |
| 3 | 问「你好」 | 不触发向量检索，无 citation |
| 4 | 删除文档后再问同一问题 | 无该文档 citation |
| 5 | ingest 损坏 PDF | job status=`failed`，UI 可见 error |
| 6 | 问通用公开问题（如美团） | `direct` 路由，无 citation |

---

## v2.0 - LangGraph 多 Agent 核心架构（2–3 周）

### 风险与前置准备

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| **Token 消耗上升** | Supervisor + 多 Agent 多轮 LLM 调用，成本可为单轮 RAG 的 3–10× | v1.0 末创建 LangSmith 项目；设 `max_iterations` / token budget；简单问答仍走 `/api/chat` |
| **调试复杂度上升** | 图分支、条件边、Tool 失败难以复现 | LangSmith trace 必开；每个 Node 结构化日志；Checkpointer 可回放 |
| **流量迁移风险** | Agent 服务与 Next.js 双链路并存期行为不一致 | v1.0 末 proxy 骨架已就绪；v2.0 按路由灰度（复杂任务 → agent，简单 → chat） |

> **v2.0 启动前检查清单**：LangSmith 项目已创建、v1.0 回归全绿、`apps/agent-service` 健康检查通过。

### 目标

实现多 Agent 协作，支持复杂指令（如「调研竞品 X 并生成报告」）的自动任务分解与协作执行。

### 具体任务

#### Agent 服务（在 v1.0 骨架上填充）

- [ ] 将 v1.0 末的 **透传代理** 替换为 LangGraph 执行引擎
- [ ] 模块填充：`agents/`、`rag/`、`tools/`、`skills/`、`graph/`
- [ ] 流式 API：`POST /agent/chat` → SSE（Vercel AI SDK 兼容格式）
- [ ] Dynamic Module 配置：模型、工具开关、Skills 目录
- [ ] LangSmith：每个 Node / Tool call 自动 trace（`LANGSMITH_PROJECT=personal-gpt-agent`）

**Reference**：`reference/hello-nest-langchain`、`reference/agui-backend`

#### LangGraph StateGraph

**State 类型**：

```typescript
interface AgentState {
  messages: BaseMessage[];
  next: string;           // 下一个节点
  task_plan: TodoItem[];  // Supervisor 生成的待办
  workspace_id: string;
  citations: Citation[];
  artifacts: Record<string, string>; // 报告 z.B. report draft
}
```

- [ ] Supervisor Node：任务分解、路由到子 Agent
- [ ] 条件边：根据 `next` 字段流转
- [ ] Checkpointer：SQLite/Postgres（`reference/langgraph-test/src/checkpointer-sqlite.mjs`）

**Reference**：`reference/langgraph-test/src/multi-agent-supervisor.mjs`、`conditional-routing.mjs`

#### 多 Agent 设计

| Agent | 职责 | 工具 |
| --- | --- | --- |
| **Supervisor** | 任务分解（To-Do）、协调子 Agent | `write_todos`, 路由 |
| **Retriever** | 专用 RAG | `kb_search`（workspace 过滤、Top-K、混合检索） |
| **Researcher** | 外部搜索 + 文档深读 | `web_search`, `file_read` |
| **Analyst** | 数据总结、数值计算 | QuickJS REPL |
| **Editor** | 结构化报告 | `report_generate`（Markdown + 引用） |

**Reference**：`reference/deep-research-assistant`（整体架构）、`reference/cron-job-tool`（web-search tool）

#### Skills 机制

```text
apps/agent-service/skills/
├── web-search/
│   └── SKILL.md
├── file-read/
│   └── SKILL.md
├── report-generate/
│   └── SKILL.md
└── kb-retrieval/
    └── SKILL.md
```

- [ ] Skill 加载器：读 `SKILL.md` 注入 system prompt
- [ ] 动态注册：配置或 LLM 决策启用哪些 Skills
- [ ] 示例 Skill 实现参考 `reference/deep-research-assistant/skills/`

#### 前后端集成

- [ ] Next.js 新增 Agent 聊天模式（复杂任务入口）
- [ ] SSE 事件类型：`text-delta`、`tool-call`、`agent-step`、`todo-update`
- [ ] 子 Agent 输出面板（参考 `reference/agui-frontend` ToolPanels）

**Reference**：`reference/agui-frontend`、`reference/agui-backend`

### 预期成果

- 输入「调研 2026 年 AI Agent 框架对比并生成报告」→ Supervisor 分解任务 → 多 Agent 协作 → 流式输出报告
- Skills 可配置扩展
- 前端可看到各 Agent 执行步骤

### 成功指标

| 指标 | 目标 |
| --- | --- |
| 复杂任务完成率 | **标准调研任务（5 个测试案例）成功率 ≥ 75%**，产出可用报告 |
| 首步响应 | < 3s 开始流式输出 |
| 可追踪 | LangSmith 可看到完整 Agent 图执行 |
| Token 可观测 | LangSmith 可统计单次任务 total tokens |

### 回归测试集（v2.0 末冻结）

`tests/regression/phase-2/`（v2.0 回归集）— 5 个标准调研任务 + v1.0 全量回归：

| # | 任务 prompt | 期望 |
| --- | --- | --- |
| 1 | 「对比 LangGraph 与 AutoGen 的优缺点，500 字以内」 | 有 todo 步骤、≥ 2 段正文、≥ 1 citation |
| 2 | 「根据知识库中 XX 文档总结三点要点」 | Retriever Agent 被调用，citation 来自 KB |
| 3 | 「调研 2026 年 RAG 趋势并生成 Markdown 报告」 | Editor 产出结构化报告，可导出 |
| 4 | 纯闲聊「今天天气怎么样」 | 不启动多 Agent 全流程，快速回复 |
| 5 | 故意断网 / 搜索 API 失败 | 优雅降级，UI 可见 error + 部分结果 |

---

## v3.0 - 记忆、存储与高级 RAG（2 周）

### 目标

持久化记忆 + 多存储后端 + Agentic RAG，支持跨会话记忆与复杂多跳查询。

### 具体任务

#### 记忆系统

| 层级 | 存储 | 用途 |
| --- | --- | --- |
| 短期 | Redis | 会话历史、临时上下文、Agent state cache |
| 长期 | Mem0 或自研 | 向量回忆 + 摘要回忆 |
| 偏好 | `AGENTS.md` / DB | 用户/Workspace 级偏好 |

- [ ] 记忆注入：System Prompt + 检索 Tool
- [ ] 会话结束自动摘要写入长期记忆

**Reference**：`reference/mem0-test`、`reference/memory-test`、`reference/deepagents-test`（workspace-memory）

#### 存储扩展

| 类型 | 技术 | 场景 |
| --- | --- | --- |
| 向量 | Astra DB + Milvus | 小规模 + 大规模向量 |
| 全文 | ElasticSearch | BM25 + IK 分词 |
| 图谱 | Neo4j | 实体关系、Graph RAG |
| 对象 | MinIO | 大文件、附件 |
| 元数据 | PostgreSQL | 已有 |

- [ ] 抽象 `VectorStore` / `FullTextStore` 接口，按 workspace 配置路由
- [ ] 混合检索：向量 + BM25 → RRF 融合

**Reference**：`reference/milvus-test`、`reference/es-test`、`reference/neo4j-graphrag`、`reference/oss-test`

#### 高级 RAG

- [ ] **Agentic RAG**：Agent 决定检索次数/策略/是否 Graph 查询
- [ ] **Graph RAG**：Neo4j 实体查询 + 关系推理（`reference/neo4j-graphrag`）
- [ ] **上下文压缩**：长上下文摘要后再生成
- [ ] **Multi-hop**：`reference/advanced-rag/src/rag-multihop.mjs`

### 预期成果

- 跨会话记住用户偏好与历史结论
- 混合检索 + Graph RAG 提升复杂问题准确率
- 大规模知识库可迁移 Milvus

### 回归测试集（v3.0 末冻结）

`tests/regression/phase-3/`（v3.0 回归集）— v1.0 + v2.0 回归 + 记忆/多跳：

| # | 用例 | 期望 |
| --- | --- | --- |
| 1 | 会话 A 声明偏好 → 会话 B 提问 | 长期记忆召回偏好 |
| 2 | 多跳问题（需 2+ 次检索） | Agentic RAG 多轮检索，答案正确 |
| 3 | 混合检索（向量 + BM25 关键词） | 专有名词文档排名提升 |
| 4 | Graph RAG 实体关系问题 | Neo4j 路径可 trace |
| 5 | workspace A / B 各上传同名文档 | 检索结果不交叉 |

---

## v4.0 - 全栈工程化与生产就绪（2–3 周）

### 目标

Docker Compose 一键部署、多租户、认证、监控，达到可上生产标准。

### 具体任务

#### 服务化完善

- [ ] Docker Compose：web + agent-service + ingest-worker + postgres + redis + minio + (可选 es/neo4j)
- [ ] 健康检查、优雅关闭、配置热加载
- [ ] 统一 SSE / WebSocket 网关

**Reference**：`reference/nest-dockerfile-test`

#### 前端工作台

- [ ] 知识库仪表盘：文档数、索引状态、存储用量
- [ ] 多 Agent 执行可视化：流程图、子 Agent 面板
- [ ] 报告导出：Markdown / PDF
- [ ] 会话历史持久化（PG）

**Reference**：`reference/typeorm-pg-crud`（conversations/messages entities）

#### 生产特性

- [ ] **多租户**：workspace 隔离 + 成员/角色
- [ ] **认证**：Clerk 或 Auth.js
- [ ] **限流/审计**：请求日志、操作审计表
- [ ] **监控**：LangSmith + Prometheus + Grafana
- [ ] **CI/CD**：GitHub Actions → Vercel（web）+ 自建/Railway（agent/ worker）

**Reference**：`reference/nest-feature`（auth guard、decorators）

#### 安全

- [ ] Prompt Injection 防护：检索上下文隔离标记
- [ ] 上传安全：类型/大小校验、内容扫描
- [ ] 密钥管理：环境变量 + 生产 secret 方案

### 预期成果

- `docker compose up` 启动完整栈
- 多用户 workspace 隔离，无交叉检索
- 生产环境可观测、可审计

### 成功指标

| 指标 | 目标 |
| --- | --- |
| 冷启动 | **`docker compose up` 后 5 分钟内**可正常聊天 + 上传文档 |
| 部署 | 新环境 30 分钟内跑通（含配置 .env） |
| 隔离 | 安全测试零 cross-tenant 泄漏 |
| 可用性 | 核心 API 99.5% uptime（自建目标） |

### 回归测试集（v4.0 末冻结）

`tests/regression/phase-4/`（v4.0 回归集）— 生产冒烟 + 全版本回归：

| # | 用例 | 期望 |
| --- | --- | --- |
| 1 | 全新 `docker compose up` → 注册/登录 → 聊天 | 5 分钟内完成 |
| 2 | 用户 A 上传文档，用户 B 检索 | B 看不到 A 的 citation |
| 3 | 触发限流 | 429 + 可读提示 |
| 4 | Prometheus `/metrics` 可 scrape | agent/chat/ingest 指标可见 |
| 5 | v1.0–v3.0 回归套件全绿 | CI 通过 |

---

## v5.0 - 高级企业特性与优化（持续）

| 方向 | 内容 | Reference |
| --- | --- | --- |
| 语音交互 | ASR + TTS | `reference/asr-and-tts-nest-service`、`reference/tts-stt-test` |
| 定时 Agent | Cron Job + 邮件通知 | `reference/cron-job-tool` |
| 评估系统 | RAGAS + 人工反馈 | `reference/langsmith-test/src/eval/` |
| 团队协作 | 共享知识库、@ 提及 | — |
| 成本优化 | 语义缓存、模型路由、Token 控制 | — |

### 回归测试集（v5.0 持续维护）

- RAGAS 自动评估 + v1.0–v4.0 人工回归用例并入 CI nightly
- 每次新增 Skill / Tool 补充 ≥ 2 个 eval case

---

## Reference 模块速查表

| 版本 | 主题 | Reference 目录 |
| --- | --- | --- |
| v1.0 | 文本切块 | `rag-test/` |
| v1.0 | 高级 RAG | `advanced-rag/` |
| v1.0 | PG CRUD | `typeorm-pg-crud/` |
| v1.0 | Redis 队列 | `redis-test/` |
| v1.0 | 对象存储 | `oss-test/` |
| v1.0 | LangSmith | `langsmith-test/` |
| v2.0 | LangGraph | `langgraph-test/` |
| v2.0 | 多 Agent 调研 | `deep-research-assistant/` |
| v2.0 | Nest + LangChain | `hello-nest-langchain/` |
| v2.0 | AGUI 流式 UI | `agui-frontend/`, `agui-backend/` |
| v2.0 | Web 搜索 Tool | `cron-job-tool/` |
| v3.0 | 记忆 | `memory-test/`, `mem0-test/`, `deepagents-test/` |
| v3.0 | Milvus | `milvus-test/` |
| v3.0 | ElasticSearch | `es-test/` |
| v3.0 | Graph RAG | `neo4j-graphrag/` |
| v4.0 | Docker 部署 | `nest-dockerfile-test/` |
| v4.0 | Nest 认证 | `nest-feature/` |
| v5.0 | 语音 | `asr-and-tts-nest-service/` |
| v5.0 | 定时任务 | `cron-job-tool/` |

---

## 实施顺序（v1.0 推荐优先级）

| 优先级 | 任务 | 说明 |
| --- | --- | --- |
| **P0** | Docker Compose + PG + Redis + BullMQ 基础 | 含 `packages/shared` 骨架与 `workspaceId` 首日 schema |
| **P0** | 文档模型 + 导入 Pipeline（BullMQ Job） | Loader → Splitter → embed → Astra，经 `VectorStore` 接口 |
| **P1** | KB 管理 API + UI | `/kb` 列表、上传、进度、CRUD |
| **P1** | 引用返回 + RAG 增强 | `/api/chat` citations + 前端卡片；HyDE/Reranker 可后置 |
| **P2** | LangSmith + 回归测试集 | 创建 LangSmith 项目；冻结 v1.0 回归集（`tests/regression/phase-1/`） |
| **P2** | Agent 服务骨架 | `apps/agent-service` 透传代理，为 v2.0 预留 |

**v1.0 验证方式**：上传一份 PDF → 进度 100% → 提问 → 回答下方出现引用卡片 → v1.0 回归 8 用例全绿。
