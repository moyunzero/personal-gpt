# Personal GPT

基于 Next.js 的个性化智能对话应用：RAG（检索增强生成）+ Astra 向量库 + 可自助管理的知识库（`/kb`），回答可溯源引用。

当前基线：**v1.0 已封板**（Monorepo · BullMQ 异步入库 · 引用卡片 · 三层查询路由）。下一步见 [产品路线图](#产品路线图-product-roadmap)。

[在线演示](https://personal-emotion-gpt.vercel.app) · [开发笔记](./docs/rag-chat-phase-1-notes.md)

## 界面预览

<p align="center">
  <img src="./assets/readme/demo-chat.png" alt="聊天首页" width="820" />
</p>

<p align="center">
  <img src="./assets/readme/demo-kb.png" alt="知识库 /kb" width="820" />
  &nbsp;
  <img src="./assets/readme/demo-chat-mobile.png" alt="聊天页移动端" width="280" />
</p>

<p align="center"><sub>上：聊天首页 · 下左：知识库 /kb · 下右：移动端</sub></p>

## 架构总览

```mermaid
flowchart TB
  subgraph Client["浏览器"]
    Chat["/ 聊天"]
    KB["/kb 知识库"]
  end

  subgraph Web["apps/web :3000"]
    ChatAPI["POST /api/chat"]
    KbAPI["/api/kb/*"]
    Router["query-router"]
    Retrieve["retrieve + citations"]
  end

  subgraph Worker["ingest-worker :3001"]
    Proc["BullMQ IngestProcessor"]
    Pipe["parse → split → embed → upsert"]
  end

  subgraph Agent["agent-service :3002"]
    AgentSSE["POST /agent/chat LangGraph SSE"]
    Super["Supervisor + Retriever/Researcher/Analyst/Editor"]
  end

  PG[(PostgreSQL)]
  Redis[(Redis / BullMQ)]
  Astra[(Astra DB)]
  Groq[Groq LLM]
  NIM[NVIDIA NIM]

  Chat --> ChatAPI
  KB --> KbAPI
  ChatAPI --> Router --> Retrieve
  Retrieve --> NIM
  Retrieve --> Astra
  Retrieve --> Groq
  KbAPI --> PG
  KbAPI --> Redis --> Proc --> Pipe
  Pipe --> NIM --> Astra
  Proc --> PG
  AgentSSE --> Super
  Super --> Astra
  Super --> Groq
```

## 特性

- **语义检索**：DataStax Astra DB ANN + NVIDIA NIM 2048 维 embedding（`query` / `passage` 分离）
- **三层查询路由**：意图快路径 → embedding Top-1 预检 → Groq LLM 二分类（灰色地带倾向检索）
- **双路检索**：用户语料 / `prompt-suggestion` 与 `psychology-qa` seed 分阈值合并（缓解混库挤占，见 [ISSUE-001](./docs/issues/ISSUE-001-mixed-corpus-recall.md)）
- **流式回答 + 引用卡片**：Vercel AI SDK `data-citations`；流结束后展示标题 / 相似度 / snippet
- **知识库管理**：`/kb` 上传 PDF·MD·TXT·DOCX，BullMQ 异步 parse→split→embed→upsert，SSE 进度
- **Monorepo**：`apps/web` · `apps/ingest-worker` · `apps/agent-service` · `packages/shared`
- **限流（可选）**：Upstash Redis；未配置时 fail-open
- **响应式 UI**：聊天 + `/kb` 共用品牌导航

## 技术栈

| 层级           | 选型                                                                        |
| -------------- | --------------------------------------------------------------------------- |
| Web            | Next.js 16.2 · React 19 · Tailwind CSS 4                                    |
| AI             | Vercel AI SDK 6 · `@ai-sdk/openai-compatible`（Groq OpenAI 兼容端点）       |
| 聊天模型       | Groq：`qwen/qwen3-32b` → `llama-3.3-70b-versatile` → `llama-3.1-8b-instant` |
| Embedding      | NVIDIA NIM `nvidia/llama-nemotron-embed-1b-v2`（2048 维）                   |
| 向量库         | DataStax Astra DB Data API                                                  |
| 元数据 / 队列  | PostgreSQL 16 + TypeORM 0.3 · Redis 7 + BullMQ 5                            |
| Worker / Agent | NestJS 11（ingest-worker :3001 · agent-service :3002）                      |
| 质量           | TypeScript · Zod · Vitest · ESLint · Prettier                               |
| 切块           | `@langchain/textsplitters`（ingest-worker + 部分 seed 脚本）                |

> 备忘：[docs/google-ai-provider.md](./docs/google-ai-provider.md) 描述过 Gemini 方案；**当前主栈仍是 Groq + NIM**，勿按该文配置生产。

## 前置要求

- Node.js **22**（与 CI 一致；本地建议 ≥ 20）
- Yarn（Yarn Workspaces monorepo）
- [DataStax Astra DB](https://astra.datastax.com/) 账户
- [Groq API Key](https://console.groq.com/keys)（`GROQ_API_KEY`）
- [NVIDIA NIM API Key](https://build.nvidia.com/)（`NIM_API_KEY`）
- 使用 `/kb` 时还需 [Docker](https://docs.docker.com/get-docker/)（本地 PostgreSQL + Redis）

## 快速开始

### 1. 克隆并安装

```bash
git clone https://github.com/moyunzero/personal-gpt.git
cd personal-gpt
yarn install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

至少填写：

| 变量                                                                                                  | 获取                                                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `ASTRA_DB_API_ENDPOINT` / `ASTRA_DB_APPLICATION_TOKEN` / `ASTRA_DB_COLLECTION` / `ASTRA_DB_NAMESPACE` | [Astra Portal](https://astra.datastax.com/) → Connect  |
| `GROQ_API_KEY`                                                                                        | [console.groq.com/keys](https://console.groq.com/keys) |
| `NIM_API_KEY`                                                                                         | [build.nvidia.com](https://build.nvidia.com/)          |

所有 app 共用仓库根目录 `.env`。

### 3. 初始化 Astra 向量集合（首次）

```bash
yarn astra:init-embedding
```

创建与 NIM 对齐的 **2048 维** collection；已存在则跳过。

### 4. 导入预设知识（可选）

```bash
# 个人/项目介绍类（source=prompt-suggestion，与检索 Path A 对齐）
yarn seed:suggestions

# 心理学问答（source=psychology-qa；数据量大，可配 LOAD_LIMIT / EMBED_BATCH_SIZE）
# LOAD_LIMIT=100 EMBED_BATCH_SIZE=8 yarn seed:psychology

# 网页抓取入库（需 ASTRA_DB_NAMESPACE）
# yarn seed

# 将 v0.1 遗留数据迁入 PG（向量 source 为 legacy-*，与日常 seed 不同）
# yarn migrate:legacy
```

### 5. 启动开发服务

#### 方案 A — 仅聊天（最小）

```bash
yarn dev:web
```

打开 [http://localhost:3000](http://localhost:3000)。RAG 走 Astra，不依赖本地 Docker。

#### 方案 B — 完整 v1.0（含 `/kb`）

需要 PostgreSQL（文档元数据）与 Redis（BullMQ）：

```bash
yarn docker:up

# 首次迁移（在仓库根目录执行）
DOTENV_CONFIG_PATH=../../.env yarn workspace web migration:run

# 两个终端
yarn dev:web      # → http://localhost:3000
yarn dev:worker   # → :3001，消费入库队列
```

知识库页：[http://localhost:3000/kb](http://localhost:3000/kb)

确认 `.env` 中 `DATABASE_URL` / `REDIS_URL` 与 `docker-compose.yml` 一致（见 `.env.example` 默认值）。

#### 方案 C — Agent 多 Agent（v2.0 MVP）

```bash
yarn dev:agent    # AGENT_SERVICE_PORT 默认 3002 → POST /agent/chat
yarn acceptance:phase-2-smoke   # live SSE：KB 命中 + 主链路门禁（需 embedding/Astra）
```

说明：v2.0 为 **MVP 关账 / 可演示**，不是生产就绪（无鉴权多租户、无 agent Docker）。关账与证据见 `tests/acceptance/phase-2-agent/`。

## 项目结构

```text
personal-gpt/
├── apps/
│   ├── web/                 # Next.js — 聊天 UI、/api/chat、/kb、TypeORM、BullMQ producer
│   ├── ingest-worker/       # NestJS — BullMQ consumer（parse→split→embed→upsert）
│   └── agent-service/       # NestJS — LangGraph 多 Agent SSE（:3002）
├── packages/
│   └── shared/              # 类型、env Zod、Groq/NIM、VectorStore、队列常量
├── script/                  # Astra 初始化、seed、repair 等根级脚本
├── apps/web/script/         # migrateLegacy、KB 迁移辅助
├── tests/
│   ├── regression/phase-1|2/ # 回归（phase-2 mock-only）
│   └── acceptance/phase-1|2-agent/ # Playwright / live SSE smoke
├── docs/                    # 开发笔记与路线图（见下方文档）
├── assets/readme/           # README 截图（Playwright 采集）
├── docker-compose.yml       # PostgreSQL 16 + Redis 7
├── .env.example
└── package.json             # Yarn workspaces 根脚本
```

## 核心功能说明

### 查询路由与 RAG

对齐进阶 RAG 思路（`reference/advanced-rag`），实现落在 `apps/web/lib/chat/`：

| 路由       | 含义            | 行为                                                    |
| ---------- | --------------- | ------------------------------------------------------- |
| `direct`   | 通用知识 / 闲聊 | 不检索，模型直接答；不发 citations                      |
| `retrieve` | 需要私有资料    | 双路检索 → 有命中则注入 context + 流末 `data-citations` |

**三层路由**（`query-router.ts`）：

1. **意图快路径**：寒暄、算式
2. **embedding 预检**：Top-1 ≥ `ROUTE_RETRIEVE_SIMILARITY`（默认 0.68）→ retrieve；&lt; `ROUTE_DIRECT_SIMILARITY`（默认 0.42）→ direct
3. **LLM 路由器**：灰色地带由 Groq `llama-3.1-8b-instant` 二分类（可用 `ENABLE_LLM_QUERY_ROUTER=false` 关闭）

**可选增强**（默认全关，见 `rag-options.ts`）：

- `ENABLE_HYDE` / `ENABLE_MULTI_QUERY` / `ENABLE_RERANKER`

### 检索与阈值（代码默认值）

| 项             | 默认                                    | 说明                                              |
| -------------- | --------------------------------------- | ------------------------------------------------- |
| Path A 门槛    | `TOP1_SIMILARITY_THRESHOLD=0.55`        | 用户上传 / `prompt-suggestion`                    |
| Path B 门槛    | `SEED_CORPUS_SIMILARITY_THRESHOLD=0.72` | `psychology-qa` seed                              |
| Top-K          | `RETRIEVAL_LIMIT=5`                     | 最终注入条数                                      |
| 硬超时         | `VECTOR_SEARCH_TIMEOUT_MS=12000`        | 超时后再有固定 10s 宽限期（`RETRIEVAL_GRACE_MS`） |
| Embedding 缓存 | `EMBEDDING_CACHE_SIZE=100`              | 进程内 LRU                                        |
| 聊天限流       | 10 req / 60s                            | Upstash；未配置则放行                             |
| KB 限流        | 30 req / 60s                            | 同上                                              |

## 可用脚本

根目录（`yarn <script>`）：

```bash
# 开发
yarn dev:web                 # Next.js → :3000
yarn dev:worker              # ingest-worker → :3001
yarn dev:agent               # agent-service → :3002

# 基础设施
yarn docker:up               # PostgreSQL + Redis

# Astra / 数据
yarn astra:init-embedding
yarn seed:suggestions
yarn seed:psychology
yarn seed
yarn migrate:legacy          # v0.1 → PG（legacy-* source）

# 质量
yarn test
yarn test:regression
yarn acceptance:phase-1
yarn validate                # format + lint + 各 workspace validate
yarn lint
yarn format
```

Web workspace：

```bash
yarn workspace web build
yarn workspace web start
DOTENV_CONFIG_PATH=../../.env yarn workspace web migration:run
yarn workspace web migrate:kb    # Vercel build 用的幂等建表脚本
```

## 部署

### Vercel（web）

1. 推送代码到 GitHub，在 [Vercel](https://vercel.com) 导入本仓库
2. **Root Directory** 设为 `apps/web`（Settings → Build and Deployment）
3. 环境变量至少：`GROQ_API_KEY`、`NIM_API_KEY`、`ASTRA_DB_*`；启用知识库还需可达的 `DATABASE_URL`、`REDIS_URL`（及常驻的 ingest-worker，**不能**只靠 Vercel Serverless）
4. 保存后手动 Redeploy 一次

> `apps/web` 的 `build` 会跑 `script/run-kb-migrations.mjs`（有 `DATABASE_URL` 时幂等建表）。ingest-worker / agent-service 需另外部署（Docker / VPS 等），见路线图 v4.0。

### 其他平台

需支持 Next.js 16+ 与 Node.js 22（或兼容的 20+），并正确配置根目录环境变量。

## 环境变量说明

### 聊天运行时必需

| 变量                         | 说明                            |
| ---------------------------- | ------------------------------- |
| `ASTRA_DB_API_ENDPOINT`      | Astra Data API 端点             |
| `ASTRA_DB_APPLICATION_TOKEN` | 访问令牌                        |
| `ASTRA_DB_COLLECTION`        | 2048 维 collection 名           |
| `ASTRA_DB_NAMESPACE`         | Keyspace（seed / 部分脚本需要） |
| `GROQ_API_KEY`               | 聊天 + RAG 辅助                 |
| `NIM_API_KEY`                | Embedding                       |

### 知识库 / Worker

| 变量                 | 说明                                         |
| -------------------- | -------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL（`/kb` CRUD、ingest_jobs）        |
| `REDIS_URL`          | BullMQ                                       |
| `UPLOAD_MAX_BYTES`   | 上传上限，默认 `20971520`（20MB）            |
| `INGEST_WORKER_PORT` | 默认 `3001`                                  |
| `WEB_URL`            | agent 转发目标，默认 `http://localhost:3000` |
| `AGENT_SERVICE_PORT` | 默认 `3002`                                  |

### 可选

| 变量                                                            | 默认                | 说明                   |
| --------------------------------------------------------------- | ------------------- | ---------------------- |
| `VECTOR_SEARCH_TIMEOUT_MS`                                      | `12000`             | 检索硬超时（ms）       |
| `EMBEDDING_CACHE_SIZE`                                          | `100`               | embedding LRU          |
| `UPSTASH_REDIS_REST_URL` / `TOKEN`                              | —                   | 限流；未配则关闭       |
| `ENABLE_LLM_QUERY_ROUTER`                                       | 开（除非 `=false`） | LLM 路由兜底           |
| `ENABLE_EMBEDDING_ROUTE_PRECHECK`                               | 开（除非 `=false`） | embedding 预检         |
| `ROUTE_RETRIEVE_SIMILARITY`                                     | `0.68`              | 预检 → retrieve        |
| `ROUTE_DIRECT_SIMILARITY`                                       | `0.42`              | 预检 → direct          |
| `SEED_CORPUS_SIMILARITY_THRESHOLD`                              | `0.72`              | psychology seed 门槛   |
| `ENABLE_HYDE` / `ENABLE_MULTI_QUERY` / `ENABLE_RERANKER`        | `false`             | 高级 RAG               |
| `LANGSMITH_API_KEY` / `LANGSMITH_TRACING` / `LANGSMITH_PROJECT` | 关                  | 追踪（fail-open）      |
| `GOOGLE_GENERATIVE_AI_API_KEY`                                  | —                   | 备用；当前默认栈未使用 |

完整注释见 [`.env.example`](./.env.example)。

## 文档

| 文档                                                                                           | 说明                          |
| ---------------------------------------------------------------------------------------------- | ----------------------------- |
| [docs/README.md](./docs/README.md)                                                             | docs 索引与笔记写作规范       |
| [docs/rag-chat-phase-1-notes.md](./docs/rag-chat-phase-1-notes.md)                             | Phase 1 开发笔记（唯一真源）  |
| [docs/enterprise-roadmap.md](./docs/enterprise-roadmap.md)                                     | 企业级路线图与任务拆解        |
| [docs/issues/ISSUE-001-mixed-corpus-recall.md](./docs/issues/ISSUE-001-mixed-corpus-recall.md) | 混库召回已知边界              |
| [docs/google-ai-provider.md](./docs/google-ai-provider.md)                                     | Gemini 方案备忘（非现行主栈） |

## 产品路线图 (Product Roadmap)

**愿景**：从个人 RAG 聊天原型演进为可生产、多租户、可观测的企业知识库平台。

完整拆解见 **[docs/enterprise-roadmap.md](./docs/enterprise-roadmap.md)**。

**架构原则**

- Chat（稳定问答）与 Agent（研究型任务）双模并存
- 检索质量与评测优先于再堆子 Agent（v3）；身份与 ACL 优先于连接器（v4）
- 异步导入：BullMQ + Redis；元数据：PostgreSQL；向量：Astra（v3 扩展混合检索 / 多存储）
- 生产治理集中在 v4；连接器与 HITL 在 v5

### v0.1 — RAG 聊天原型（已完成）

单页聊天、`POST /api/chat`、Astra 检索、Groq 多模型 fallback、seed 脚本、基础 CI。

历史边界（无 `/kb`、无 citation）已由 v1.0 覆盖。

### v1.0 — RAG 强化与知识库管理（已封板 ✅）

| 模块       | 状态                                                           |
| ---------- | -------------------------------------------------------------- |
| 基础设施   | ✅ Monorepo + Docker Compose + BullMQ Worker                   |
| 数据模型   | ✅ `workspaceId` 全链路（UI 仍为单 workspace）                 |
| 文档导入   | ✅ PDF/MD/TXT/DOCX                                             |
| 知识库 UI  | ✅ `/kb` 上传 / 列表 / 筛选 / CRUD / SSE 进度                  |
| RAG        | ✅ 引用 + 三层路由 + 双路检索 + 可选 HyDE/Multi-Query/Reranker |
| 工程       | ✅ CI + 回归 + Playwright 验收 8/8 + LangSmith（可选）         |
| Agent 多 Agent | ✅ LangGraph Supervisor + SSE + 步骤面板（v2.0 **MVP**） |

**仍未做**：用户认证、聊天历史持久化、多 workspace UI、BM25 混合检索、agent 生产部署（见 ISSUE-001 / v3–v4）。

**演示**：[https://personal-emotion-gpt.vercel.app](https://personal-emotion-gpt.vercel.app) · [GitHub](https://github.com/moyunzero/personal-gpt)

### v2.0 — LangGraph 多 Agent ✅ MVP 关账（非生产就绪）

Nest.js Agent + Supervisor / 子 Agent、Skills、前端步骤可视化。简单聊天仍走 `/api/chat`。  
证据：人工截图 + `yarn acceptance:phase-2-smoke`（KB 命中 live citation）→ `tests/acceptance/phase-2-agent/`。  
**v2 收口**：不再扩办事型工具；详细对标与后续规划见 `docs/enterprise-roadmap.md`。

### v3.0 — 检索可信度 + 记忆 + 评测 🔜

对标 RAGFlow/FastGPT「答得准」：混合检索默认路径、Corrective RAG、黄金集评测、Postgres checkpointer、Redis/Mem0 记忆。  
**不做**：登录、连接器、业务写操作。

### v4.0 — 身份治理 + 可生产部署

对标 MaxKB/企业交付 + Copilot 权限裁剪：Auth、RBAC、ACL 过滤检索、全栈 Docker（含 agent）、会话历史、审计。

### v5.0 — 连接器 Lite / HITL / 谨慎行动

对标 Glean·Dify 浅层子集：1–2 个只读连接器、人机确认、工具白名单；语音/定时为 P2。

---

**当前进度**：**v1.0 已封板** · **v2.0 MVP 已关账** → 下一步 **v3.0（检索与评测）**。完整路线图：`docs/enterprise-roadmap.md`。

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

[MIT](LICENSE)

## 致谢

- [Next.js](https://nextjs.org/)
- [Vercel AI SDK](https://sdk.vercel.ai/)
- [Groq](https://console.groq.com/)
- [NVIDIA NIM](https://build.nvidia.com/)
- [DataStax Astra DB](https://www.datastax.com/)
- [NestJS](https://nestjs.com/)
- [BullMQ](https://docs.bullmq.io/)

---

Made with care by [MoYun](https://github.com/moyunzero)
