# Personal GPT — 企业级知识库产品路线图

> **基线**：v0.1 RAG 聊天原型（已完成）  
> **愿景**：可演示 → 可信任检索 → 可生产治理 的企业知识库；Chat 稳定问答，Agent 负责研究型任务（非一开始做跨系统「办事」）  
> **参考**：`reference/`（课程实战）+ 市面对标（下文）  
> **最后更新**：2026-08-14（v2.x 加固 + Code Review 延期项落档）

### 版本对照

| 版本 | 主题 | 状态 |
| --- | --- | --- |
| **v0.1** | RAG 聊天原型 | ✅ 已完成 |
| **v1.0** | RAG 强化 + 企业知识库 | ✅ 已封板 |
| **v2.0** | LangGraph 多 Agent（研究型） | ✅ MVP 关账 / 非生产（`tests/acceptance/phase-2-agent/CLOSEOUT.md`） |
| **v2.x** | Agent 稳定性加固（配额/校验/BFF） | ✅ 2026-08-14（见 CLOSEOUT「v2.x」） |
| **v3.0** | 检索可信度 + 记忆 + 评测 | 🔜 下一步（对标 RAGFlow/FastGPT 质量层） |
| **v4.0** | 身份权限 + 可生产部署 | 规划中（对标 MaxKB/企业交付层） |
| **v5.0** | 连接器 / HITL / 行动型 Agent | 持续演进（对标 Glean·Dify 的浅层子集） |

---

## 市面对标与产品策略（2026-08）

### 头部产品怎么分层

| 类型 | 代表 | 他们赢在哪 | 我们不照搬的原因 |
| --- | --- | --- | --- |
| **RAG 引擎** | RAGFlow、FastGPT | 复杂文档解析、混合检索、问题优化、引用可解释 | 我们已有上传+向量+引用；缺深度解析与默认开的混合检索 |
| **Agent/工作流平台** | Dify、MaxKB | 可视化编排、模型管理、团队协作、HTTP/工具节点 | 我们用代码化 LangGraph（可控、可测）；不做第二套低代码 IDE |
| **企业搜索/上下文** | Glean、MS Copilot | 百级连接器、**权限感知**检索、工作图谱 | 个人项目无 SSO 资产；连接器后置，先做「上传库 + ACL 裁剪」 |
| **空间内助手** | Notion AI、飞书知识库 AI | 嵌在已有办公流里 | 我们是独立产品；先做好双模 Chat\|Agent |

**公开设计共识（Copilot Studio / Graph 等）**：查询改写 → 多源检索 → 摘要 → **按用户权限裁剪** → 引用。企业差距常在「身份边界 + 连接器」，不在再加几个子 Agent。

### 本项目定位（写进产品原则）

1. **Chat = 增强搜索问答**（低延迟、高可预测）—— `/api/chat`  
2. **Agent = 研究型任务助手**（查库 / 联网 / 计算 / 写报告）—— `/agent/chat`  
3. **不做**（至少到 v4 末）：跨系统写操作业务闭环（订票、改 ERP）；完整可视化工作流 IDE  
4. **差异化**：程序员可控的 LangGraph Supervisor + 引用诚实 + monorepo 可演进；对标「自建可讲解的企业 KB」，不是对标融资级 SaaS 全家桶

### 能力差距 → 版本落点

| 市场能力 | 现状 | 落点 |
| --- | --- | --- |
| 默认混合检索 / 重排 / 自纠 RAG | 可选开关默认关；无 Corrective 环 | **v3** |
| 复杂文档理解（表/扫描 PDF） | 基础 PDF/DOCX | **v3**（增强解析，参考 RAGFlow 思路） |
| 会话/长期记忆 | 默认无跨会话 | **v3** |
| 评测与质量门禁 | mock + 少量 live smoke | **v3** |
| SSO / 成员 / **ACL 裁剪检索** | 无登录 | **v4** |
| Postgres checkpointer、全栈 Docker | MemorySaver；agent 未入 Compose | **v4** |
| 审计、配额、会话历史 | 弱 | **v4** |
| 连接器（Notion/飞书/Web 同步） | 仅上传 | **v5** |
| HITL 审批、HTTP 业务工具 | 无 | **v5** |
| 语音 / 定时 Agent | 无 | **v5** |

> **决策（2026-08-13）**：v2.0 **停止扩 scope**（不再塞办事型工具）。先 v3 把「答得准、记得住、测得到」做厚，再 v4 做「可上线治理」，最后 v5 才碰连接器与行动。

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
| 可生产 | **v4.0** 集中：鉴权、ACL、Docker、审计；v3 先夯检索与评测 |

### 已做决策

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 异步文档处理 | **BullMQ + Redis** | 与 v3 记忆缓存、v4 Worker 同栈；参考 `reference/redis-test` |
| 双模交互 | **Chat 与 Agent 并存** | 对标业界：简单问答走 Chat，研究/报告走 Agent；不强制迁移全部流量 |
| 元数据存储 | **PostgreSQL** | 文档 CRUD、任务、后续会话/审计；参考 `reference/typeorm-pg-crud` |
| 向量存储 | **Astra 为主 → v3 加 ES/Milvus** | 先混合检索提质，再规模化 |
| Agent 边界（至 v4） | **研究型工具集** | kb / web / calculator / 报告；业务写操作与 HITL → v5 |
| workspaceId | **Day 1 全链路** | 避免后期洗向量；运行时可仍默认 `default` 直至 v4 多租户 UI |

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

- [x] 将 v1.0 末的 **透传代理** 替换为 LangGraph 执行引擎
- [x] 模块填充：`agents/`、`rag/`、`tools/`、`skills/`、`graph/`
- [x] 流式 API：`POST /agent/chat` → SSE（Vercel AI SDK 兼容格式）
- [x] 配置：`AGENT_*` / `ENABLED_SKILLS` / 模型 provider（env 驱动；非 Nest Dynamic Module 形式）
- [x] LangSmith：`LANGSMITH_TRACING=true` + key 时 fail-open 启用；默认 `LANGSMITH_PROJECT=personal-gpt-agent`

**Reference**：`reference/hello-nest-langchain`、`reference/agui-backend`

#### LangGraph StateGraph

**State 类型（实现）**：`messages` · `workspaceId` · `todos` · `citations` · `route`（见 `apps/agent-service/src/graph/state.ts`）。路线图草图中的 `next` / `task_plan` / `artifacts` 由 Supervisor handoff + SSE todo/step 覆盖，未单独立字段。

- [x] Supervisor：任务分解、路由到子 Agent（`@langchain/langgraph-supervisor`）
- [x] 条件边：外层闲聊短路 `short` / `supervisor`
- [x] Checkpointer：默认 **MemorySaver**（v2.0 完成标准）；可选 `AGENT_CHECKPOINTER=sqlite` → SqliteSaver

**Reference**：`reference/langgraph-test/src/multi-agent-supervisor.mjs`、`conditional-routing.mjs`

#### 多 Agent 设计

| Agent | 职责 | 工具（v2.0 落地） |
| --- | --- | --- |
| **Supervisor** | 任务分解、协调子 Agent | handoff（todo 由 SSE 层推送） |
| **Retriever** | 专用 RAG | `kb_search`（workspace 过滤 + 相似度门槛） |
| **Researcher** | 外部搜索 | `web_search`（Bocha；失败降级） |
| **Analyst** | 数值计算 | 受限 `calculator`（**不**引入 QuickJS） |
| **Editor** | 结构化报告 | prompt 定稿 Markdown（**无**独立 `report_generate` tool） |

**v2.0 明确不做 / 延期**：`file_read`、`report_generate` tool、QuickJS、Postgres checkpointer、agent Docker（→ v4.0）。

**Reference**：`reference/deep-research-assistant`（整体架构）、`reference/cron-job-tool`（web-search tool）

#### Skills 机制

```text
apps/agent-service/skills/
├── web-research/
│   └── SKILL.md
├── report-writer/
│   └── SKILL.md
└── kb-retrieval/
    └── SKILL.md
```

- [x] Skill 加载器：读 `SKILL.md` 注入 system prompt
- [x] 动态启用：`ENABLED_SKILLS` 逗号列表
- [x] 示例 Skill：kb-retrieval / web-research / report-writer

#### 前后端集成

- [x] Next.js Agent 聊天模式（顶栏 Chat | Agent）
- [x] SSE：`text-delta`、tool parts、`data-agent-step`、`data-todo-update`、`data-citations`
- [x] 子 Agent 步骤面板 + 待办列表

**Reference**：`reference/agui-frontend`、`reference/agui-backend`

### 预期成果

- 输入「调研 … 并生成报告」→ Supervisor 分解 → 多 Agent 协作 → 流式报告
- Skills 可配置扩展
- 前端可看到各 Agent 执行步骤

### 成功指标

| 指标 | 目标 | v2.0 关账说明 |
| --- | --- | --- |
| 复杂任务完成率 | 标准调研 ≥ 75% | 人工验收样例见 `tests/acceptance/phase-2-agent/`；mock 回归 `tests/regression/phase-2/` 全绿 |
| 首步响应 | < 3s 开始流式 | 闲聊短路与 SSE `start` 优先；依赖模型供应商延迟 |
| 可追踪 | LangSmith 可见图执行 | 设置 `LANGSMITH_API_KEY` + `LANGSMITH_TRACING=true` |
| Token 可观测 | LangSmith total tokens | 同上 |

### 回归测试集（v2.0 末冻结）

`tests/regression/phase-2/`（v2.0 回归集）— 5 个标准调研任务 + v1.0 全量回归：

| # | 任务 prompt | 期望 |
| --- | --- | --- |
| 1 | 「对比 LangGraph 与 AutoGen 的优缺点，500 字以内」 | 有 todo 步骤、≥ 2 段正文、≥ 1 citation |
| 2 | 「根据知识库中 XX 文档总结三点要点」 | Retriever Agent 被调用，citation 来自 KB |
| 3 | 「调研 2026 年 RAG 趋势并生成 Markdown 报告」 | Editor 产出结构化报告，可导出 |
| 4 | 纯闲聊「今天天气怎么样」 | 不启动多 Agent 全流程，快速回复 |
| 5 | 故意断网 / 搜索 API 失败 | 优雅降级，UI 可见 error + 部分结果 |

> **v2.0 核心状态（2026-08-12）**：已关账为 **MVP / 核心完成**。详见 `tests/acceptance/phase-2-agent/CLOSEOUT.md`。  
> **2026-08-13 增补**：live SSE smoke（含 KB 命中）`yarn acceptance:phase-2-smoke`；服务端 KB 预检索。v2 **不再扩办事型工具**。  
> **2026-08-14 v2.x 加固**：`web_search` per-thread 配额、OpenAI 默认模型修复、MemorySaver 进程单例、body Zod、可选 `AGENT_INTERNAL_TOKEN` + `/api/agent/chat` BFF、citation fragment、Supervisor Skills 瘦身、按需预检索。架构债（强制续跑进图等）见下方 v3–v5 待办。

---

## v2.x → 后续版本：Code Review 延期项（2026-08-14）

> 来源：Agent / Prompt / 工程多模型 Code Review。下列项**不在 v2.x 加固范围**，按版本落档便于查阅。

### 归入 v3.0

| 项 | 说明 |
| --- | --- |
| Prompt registry + `promptId@version` 进 LangSmith/trace | 模板外置、可 A/B、可回滚；需评测体系配套 |
| 工具返回结构化 `{ status, code, message, data }` | 替代纯自然语言降级串；牵涉 Retriever/Editor 解析与回归 |
| Agent systemPrompt 全面外置 `.md` | 与 registry / 评测一起做 |
| Intent 分类器增强 / 替代 regex 清单 | `inferRequiredSpecialists` 升级；验收用例矩阵 |
| 相似度门槛评测驱动调参 | 与黄金集、自纠 RAG 同里程碑 |
| `file_read` / `report_generate` 等新工具 | CLOSEOUT 已标 v3+ |

### 归入 v4.0

| 项 | 说明 |
| --- | --- |
| **正式鉴权与多租户**；`workspaceId` 只从身份推导 | v2.x 仅有可选 `AGENT_INTERNAL_TOKEN` 临时护栏，≠ 身份系统 |
| agent-service 进入 Docker Compose | CLOSEOUT 已延期 |
| Postgres checkpointer（多实例会话） | 本阶段 MemorySaver 单例 / sqlite 够用 |
| 去掉进程级 `kb-search-context` Map，全面 RunnableConfig / 多副本安全 | 多实例部署时硬问题 |
| 暴露面收敛（仅 BFF、收紧 CORS）生产化 | 与身份、部署同做 |

### 归入编排重构里程碑（建议挂在 v3 末或独立 spike，勿与 v4 身份混做）

| 项 | 说明 |
| --- | --- |
| ~~强制续跑收进 LangGraph 边 / `Command`~~ | ✅ **2026-08-14**：多步清单 ≥2 → Sequential 确定性边；开放 Supervisor 仍保留 HumanMessage 兜底 |
| 拆分 `agent.service.ts` God Service | stream / progress / prefetch 模块化 |
| ~~确定性「库→网→报告」Sequential 子图~~ | ✅ 与开放 Supervisor 分流（`shouldUseSequentialPipeline`） |
| Supervisor / Editor 分模型 | 需成本与质量对比 |
| `todos` / `citations` 全面进 checkpointed `AgentState` | SSE 只投影 state |

### 归入 v5.0

| 项 | 说明 |
| --- | --- |
| HITL、连接器、行动型工具 | 路线图原有范围 |

---

## v3.0 - 检索可信度、记忆与评测（约 5–8 周）🔜

> **对标**：RAGFlow / FastGPT 的「答得准」；补 Corrective/Agentic RAG，而不是再堆子 Agent。  
> **Reference**：`advanced-rag/`、`es-test/`、`milvus-test/`、`mem0-test/`、`memory-test/`、`neo4j-graphrag/`、`langsmith-test/`  
> **关账口径（D-01/D-02/D-04）**：enterprise 质量层 + GSD ROADMAP 记忆/多存储/Graph **同等必达（全并集）**；与 `.planning/ROADMAP.md` Phase 3 **双写同一清单与四 wave**。每波可演示、可合 main；**最终 Milestone** 才勾全并集关账（D-05）。

### 目标

让 Chat 与 Agent **共用同一套更强的检索底座**（`packages/shared`）：混合检索默认 + Rerank 默认开 + Corrective + 黄金集 + ISSUE-001 分库根治 + Redis 短期 + Mem0 长期 + Postgres checkpointer（单实例）+ Milvus VectorStore + Neo4j Graph RAG。

### 四 Wave（全部 Milestone-required，非可选 P2）

| Wave | 名称 | 必达内容 |
| --- | --- | --- |
| **1 质量底座** | hybrid + RRF + rerank 默认开 + Corrective + corpus 分库 + ISSUE-001 Closed + 黄金集骨架 | ES BM25 + Astra 向量 → 应用层 RRF；Chat `/api/chat` 与 Agent `kb_search` 共用；默认只查 user corpus |
| **2 记忆** | Redis 短期 + Mem0 长期 + Postgres checkpointer | 跨会话偏好召回；单实例同 `thread_id` 可恢复 |
| **3 多存储** | Milvus VectorStore | 工厂可切换；workspace 隔离回归绿 |
| **4 Graph** | Neo4j Graph RAG | ✅ 实体关系问答可 trace 路径（03-07）；Milestone 全并集关账 |

**工期：** 约 **5–8 周**（不再按「~2–3 周」或把 Graph/Milvus 降为可选 P2）。

### 书面降级协议（D-06）

单项外部依赖（如 **Mem0** 或同类记忆 provider）卡住时：

1. 默认等待 **7 自然日**；
2. **须开发者确认**后，才可将该项降为「接口 + mock/旁路 + 已知缺口」计入关账旁注；
3. **不得**默默删除 Success Criteria 或从全并集清单中 silently drop。

### Wave 附带 Should（D-07，不挡关账）

以下 v2 CR 延期项记为 **Should**，**不是** Phase 3 must-have / Success Criteria：

- Prompt registry / prompt 外置与 version 写入 trace  
- 工具结构化返回（`status` / `code`）  
- Intent 增强  
- `file_read` / `report_generate` 等工具补齐  

### 明确不做（留给 v4/v5）

- 登录 / SSO / 成员角色 UI、ACL 按用户裁剪检索  
- 外部连接器（飞书/Notion/Confluence）  
- HITL 审批节点、业务 HTTP 写操作  
- 可视化工作流编辑器、agent Docker 全栈生产、多副本 checkpointer  
- MinIO（跟 v4，除非提前需要大文件）  

### 成功指标（对齐 `.planning/ROADMAP.md` Phase 3 SC）

| # | 指标 | 目标 |
| --- | --- | --- |
| 1 | 跨会话记忆 | 会话 A 声明偏好后，会话 B 可召回（Redis + Mem0） |
| 2 | Agentic / Corrective | 多跳 `kb_search` + 管道内 Corrective（改写再检 ≤1）给出正确答案 |
| 3 | 混合检索 + 默认 Rerank | 专有名词/编号类查询相对「仅向量」明显提升 |
| 4 | Graph RAG | 实体关系问题可 trace Neo4j 路径 |
| 5 | 隔离 / ISSUE-001 | workspace A/B 同名文档零交叉；`corpus=user` 时 citation 不得出现 `psychology-qa` |
| 6 | Checkpointer + 共用底座 | 单实例同 `thread_id` 可恢复；Chat/Agent 共用 `packages/shared` hybrid |
| 7 | 评测门禁 | 黄金集 ≥20（nightly）+ `tests/regression/phase-3/` 全绿（`GOLDEN-01`；RAGAS 仍为 Phase 5 `EVAL-01`） |

### 回归测试集（v3.0 末冻结，对齐 VALIDATION 01–06）

`tests/regression/phase-3/`：

| # | 用例 | 期望 |
| --- | --- | --- |
| 01 | 专有名词 / 编号类查询 | 混合检索命中目标文档 |
| 02 | corpus 隔离 / ISSUE-001 | `corpus=user` 时无 psychology-qa citation |
| 03 | 会话 A 偏好 → 会话 B | Redis/Mem0 记忆可见 |
| 04 | Agent 重启后续聊 | Postgres checkpointer 恢复 |
| 05 | workspace A/B 同名文档 | 零交叉 |
| 06 | Graph 实体关系 | ✅ Neo4j 路径可 trace（03-07 fixture + allowlist） |

另：Corrective 单测（改写上限）+ `yarn eval:phase-3` 黄金集 smoke。

---

## v4.0 - 身份、治理与生产部署（2–3 周）

> **对标**：MaxKB / 企业交付层 + Copilot「安全修整」思路（按用户可见范围检索）。  
> **Reference**：`nest-feature/`、`nest-dockerfile-test/`、`oss-test/`、`typeorm-pg-crud/`

### 目标

达到 **可给小团队私有化试用** 的标准：谁登录、谁能看哪些文档、如何一键起栈、如何审计。

### P0（必须）

| 项 | 说明 |
| --- | --- |
| **认证** | Auth.js 或 Clerk；会话绑定 userId；**废弃**仅靠 `AGENT_INTERNAL_TOKEN` 的临时护栏 |
| **Workspace 成员与角色** | owner / editor / viewer（最小 RBAC）；`workspaceId` 禁止客户端任意填写 |
| **ACL 裁剪检索** | 检索与 citation **只返回当前用户有权文档**（对标 Copilot security trim） |
| **Docker Compose 全栈** | web + agent-service + ingest-worker + postgres + redis +（可选 minio） |
| **会话历史持久化** | PG 存 Chat/Agent 历史，工作台可回看；Postgres checkpointer 多实例 |

### P1（应做）

| 项 | 说明 |
| --- | --- |
| 操作审计 | 上传/删除/Agent 工具调用审计表 |
| 限流与配额 | 按用户/workspace |
| MinIO/S3 | 替换本地 `uploads/` |
| 监控 | Prometheus 指标 + LangSmith 项目规范 |
| Agent 报告导出 | Markdown 下载；PDF 可选 |

### 明确不做（留给 v5）

- 百级 SaaS 连接器  
- 完整 HITL 审批流产品化  
- 跨系统写操作（报销入账等）  

### 成功指标

| 指标 | 目标 |
| --- | --- |
| `docker compose up` | 5 分钟内可登录 + 聊天 + 上传 |
| 隔离 | 安全测试零 cross-user / cross-workspace 泄漏 |
| 权限 | 无权限文档永不出现在 citation |
| 回归 | `phase-4` 冒烟 + 既有套件全绿 |

### 回归测试集（v4.0 末冻结）

`tests/regression/phase-4/`：登录隔离、ACL citation、限流、Compose 冒烟、v1–v3 回归。

---

## v5.0 - 连接器、人机协同与行动型扩展（持续）

> **对标**：Glean/Dify 的**浅层子集**——少量连接器 + 工具节点 + HITL；不追求 100+ 连接器或完整低代码 IDE。

| 方向 | 内容 | 优先级 |
| --- | --- | --- |
| **连接器 Lite** | Web 站点同步、Notion/飞书只读同步（1–2 个打透） | P0 |
| **HITL** | Agent 关键步骤人工确认 / 拒绝 | P0 |
| **工具治理** | HTTP 工具白名单、密钥隔离、调用审计 | P0 |
| **行动型试点** | 1 个只读或低风险写操作业务工具（明确审批） | P1 |
| 语音 | ASR + TTS | P2 |
| 定时 Agent | Cron + 通知 | P2 |
| 成本 | 语义缓存、模型路由 | P1 |
| 团队协作 | @ 提及、共享视图 | P2 |

### 回归 / 评估

- RAGAS 或等价自动评估 + 人工抽检并入 nightly  
- 每个新连接器 / 工具 ≥ 2 个 eval case  

---

## 推荐实施顺序（自 2026-08 起）

| 优先级 | 版本 | 做什么 | 验证 |
| --- | --- | --- | --- |
| **已完成** | v2 / v2.x | MVP 关账 + 稳定性加固（配额/模型/BFF/校验） | CLOSEOUT + 单测/回归 |
| **Wave1–4（全并集）** | v3 | 质量底座 → 记忆 → Milvus → Graph（约 5–8 周；含 GOLDEN/CP/CORPUS） | phase-3 01–06 + eval smoke |
| **P0** | v4 | 鉴权 + ACL 检索 + Compose 含 agent | phase-4 安全冒烟 |
| **P1** | v4 | 审计、历史、MinIO、导出 | 工作台可用 |
| **其后** | v5 | 连接器 Lite → HITL → 谨慎开放行动工具 | 分工具验收 |

---

## Reference 模块速查表

| 版本 | 主题 | Reference 目录 |
| --- | --- | --- |
| v1–v2 | 切块 / 高级 RAG / PG / Redis / OSS / LangSmith | `rag-test/` `advanced-rag/` `typeorm-pg-crud/` `redis-test/` `oss-test/` `langsmith-test/` |
| v2 | LangGraph / 调研 Agent / AGUI / Web 搜索 | `langgraph-test/` `deep-research-assistant/` `agui-*` `cron-job-tool/` |
| v3 | 记忆 / ES / Milvus / GraphRAG | `memory-test/` `mem0-test/` `es-test/` `milvus-test/` `neo4j-graphrag/` |
| v4 | Docker / 认证 | `nest-dockerfile-test/` `nest-feature/` |
| v5 | 语音 / 定时 | `asr-and-tts-nest-service/` `cron-job-tool/` |
