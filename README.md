# Personal GPT 🤖

一个基于 Next.js 和 AI 技术构建的个性化智能对话应用，使用 RAG（检索增强生成）技术结合向量数据库，提供更加个性化和准确的对话体验。

## ✨ 特性

- 🎯 **智能上下文检索**：基于 DataStax Astra DB 向量数据库的语义搜索
- 🚀 **流式响应**：实时流式输出，提供流畅的对话体验
- 🧠 **智能判断**：自动识别问题类型，决定是否需要向量搜索
- 💬 **友好界面**：简洁美观的聊天界面，支持 Markdown 渲染
- ⚡ **高性能**：优化的查询策略和超时控制
- 🎨 **响应式设计**：适配各种屏幕尺寸

## 🛠️ 技术栈

- **前端框架**：[Next.js 16](https://nextjs.org/) App Router + React 19
- **AI SDK**：[Vercel AI SDK 6](https://sdk.vercel.ai/) + `@ai-sdk/react`
- **LLM 提供商**：[Groq](https://console.groq.com/)（`@ai-sdk/groq`，聊天主模型 + RAG 辅助）
- **向量数据库**：[DataStax Astra DB](https://www.datastax.com/products/datastax-astra) Data API
- **Embedding**：[NVIDIA NIM](https://build.nvidia.com/) `llama-nemotron-embed-1b-v2`（2048 维）
- **知识库元数据**：PostgreSQL + TypeORM；异步入库：**BullMQ + Redis**
- **Monorepo**：`apps/web`（Next.js）、`apps/ingest-worker`（NestJS）、`apps/agent-service`（NestJS 骨架）
- **限流（可选）**：Upstash Redis + `@upstash/ratelimit`
- **样式**：Tailwind CSS 4
- **语言与质量**：TypeScript, Zod, Vitest, ESLint
- **内容渲染**：React Markdown + remark-gfm
- **数据导入脚本**：LangChain（仅用于脚本侧网页抓取、切块与入库）

## 📋 前置要求

- Node.js 20+
- Yarn（推荐，本项目为 Yarn Workspaces monorepo）
- [DataStax Astra DB](https://astra.datastax.com/) 账户
- [Groq API Key](https://console.groq.com/keys)（`GROQ_API_KEY`，免费层无需绑卡）
- [NVIDIA NIM API Key](https://build.nvidia.com/)（`NIM_API_KEY`，用于 embedding）
- **知识库功能额外需要**：[Docker](https://docs.docker.com/get-docker/)（本地 PostgreSQL + Redis）

## 🚀 快速开始

### 1. 克隆并安装

```bash
git clone <your-repo-url>
cd personal-gpt
yarn install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑仓库根目录的 `.env`，至少填入：

| 变量           | 获取方式                                               |
| -------------- | ------------------------------------------------------ |
| `ASTRA_DB_*`   | [Astra Portal](https://astra.datastax.com/) → Connect  |
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) |
| `NIM_API_KEY`  | [build.nvidia.com](https://build.nvidia.com/)          |

> 所有 app 共用根目录 `.env`；`yarn dev:web` 会通过 `DOTENV_CONFIG_PATH=../../.env` 加载。

### 3. 初始化 Astra 向量集合（首次）

```bash
yarn astra:init-embedding
```

创建 2048 维 collection（与 NIM embedding 对齐）。已存在则自动跳过。

### 4. 导入预设知识（可选，推荐）

```bash
# 个人/项目介绍类快捷问答 — 建议先跑
yarn seed:suggestions

# 心理学问答（数据量大，支持断点续跑）
# LOAD_LIMIT=100 EMBED_BATCH_SIZE=8 yarn seed:psychology

# 从网页抓取并入库（需配置 ASTRA_DB_NAMESPACE）
# yarn seed
```

### 5. 启动开发服务

#### 方案 A — 仅聊天（最小）

```bash
yarn dev:web
```

打开 [http://localhost:3000](http://localhost:3000) 即可对话（RAG 检索走 Astra，不依赖本地 Docker）。

#### 方案 B — 完整 v1.0（含 `/kb` 知识库上传）

需要 PostgreSQL（文档元数据）与 Redis（BullMQ 任务队列）：

```bash
# 1. 启动本地基础设施（只需一次，或 docker compose down 后再 up）
yarn docker:up

# 2. 确认 .env 中 DATABASE_URL / REDIS_URL 与 docker-compose.yml 一致（.env.example 已给出默认值）

# 3. 执行数据库迁移（首次）
DOTENV_CONFIG_PATH=../../.env yarn workspace web migration:run

# 4. 开两个终端分别启动 Web 与入库 Worker
yarn dev:web      # → http://localhost:3000
yarn dev:worker   # 消费 PDF/MD/TXT/DOCX 异步入库任务
```

知识库管理页：[http://localhost:3000/kb](http://localhost:3000/kb)

#### 方案 C — Agent 透传骨架（可选，v2.0 前置）

```bash
yarn dev:agent    # 默认 http://localhost:3002，转发至 web /api/chat
```

## 📁 项目结构

```text
personal-gpt/
├── apps/
│   ├── web/                      # Next.js 16 — 聊天 UI、/api/chat、/kb 知识库 API
│   ├── ingest-worker/            # NestJS — BullMQ 消费端，文档解析/切块/embedding/入库
│   └── agent-service/            # NestJS — Agent 透传骨架（v2.0 LangGraph 预留）
├── packages/
│   └── shared/                   # 共享类型、env schema、Astra 向量库、embedding 工具
├── script/                       # 根级数据导入与 Astra 初始化脚本
├── tests/regression/             # Phase-1 回归测试
├── docker-compose.yml            # 本地 PostgreSQL + Redis
├── .env.example                  # 环境变量模板（复制为 .env）
└── package.json                  # Yarn workspaces 根脚本
```

## 🔧 核心功能说明

### RAG 检索增强生成

应用采用**混合 RAG**（对齐 `reference/advanced-rag/rag-query-router.mjs`）：

| 路由       | 含义            | 行为                                            |
| ---------- | --------------- | ----------------------------------------------- |
| `direct`   | 通用知识 / 闲聊 | 不走向量检索，模型直接回答                      |
| `retrieve` | 需要私有资料    | 检索知识库 → 有命中则引用，无命中仍可用通用知识 |

**三层路由**（对齐 `reference/advanced-rag/rag-query-router.mjs`）：

1. **意图快路径**：寒暄、算式（词表，非巨型正则）
2. **embedding 预检**：Top-1 相似度 ≥ 0.68 → retrieve；< 0.42 → direct
3. **LLM 路由器**：灰色地带二分类（Flash Lite）

**可选 RAG 增强**（`ENABLE_HYDE` / `ENABLE_MULTI_QUERY` / `ENABLE_RERANKER`）：

- HyDE：假设性文档再 embedding
- Multi-Query：多查询变体合并
- Reranker：LLM 语义重排 Top-K

### 向量搜索优化

- 使用 NVIDIA NIM `llama-nemotron-embed-1b-v2` 生成嵌入向量（2048 维）
- 相似度阈值：普通查询 0.65，快捷建议类查询 0.55
- 普通查询返回前 3 个最相关文档，快捷建议类查询最多返回 5 个
- 内置 embedding LRU 缓存，减少重复问题的首字延迟
- 可选 Upstash Redis 按 IP 限流（10 次 / 60 秒），未配置时自动放行，方便本地开发
- 智能降级策略确保服务可用性

## 📝 可用脚本

根目录（`yarn <script>`）：

```bash
# 开发
yarn dev:web          # Next.js → :3000
yarn dev:worker       # ingest-worker（知识库入库，需 Redis）
yarn dev:agent        # agent-service → :3002（可选）

# 本地基础设施
yarn docker:up        # docker compose up -d（PostgreSQL + Redis）

# Astra / 数据导入
yarn astra:init-embedding   # 创建 2048 维向量 collection
yarn seed:suggestions       # 导入预设问答
yarn seed:psychology        # 导入心理学数据（大批量）
yarn seed                   # 网页抓取入库

# 质量
yarn test                   # 全仓 Vitest
yarn test:regression        # Phase-1 回归
yarn validate               # web + worker + agent + shared 全量校验
```

Web workspace（`yarn workspace web <script>`）：

```bash
yarn workspace web build
yarn workspace web start          # 生产模式
DOTENV_CONFIG_PATH=../../.env yarn workspace web migration:run
```

## 🌐 部署

### Vercel 部署（推荐）

1. 将代码推送到 GitHub
2. 在 [Vercel](https://vercel.com) 导入项目（或打开已有项目 `personal-gpt`）
3. **设置 Root Directory（monorepo 必需）**
   - 进入项目 → 左侧 **Settings** → **Build and Deployment**（不是 General）
   - 找到 **Root Directory** → 点 **Edit** → 填入 `apps/web` → **Save**
   - 若是首次导入：在 Deploy 前的配置页，Framework 选 Next.js，Root Directory 点 **Edit** 填 `apps/web`
4. 配置环境变量（至少 `GROQ_API_KEY`、`NIM_API_KEY`、`ASTRA_DB_*`；知识库功能还需 `DATABASE_URL`、`REDIS_URL`）
5. 重新部署（Settings 保存后需手动 Redeploy 一次）

> 找不到 Root Directory？路径是 **Settings → Build and Deployment**，向下滚动。改完后必须 Redeploy，仅 push 代码不会自动应用该设置。

### 其他平台

确保平台支持 Next.js 16+ 和 Node.js 20+，并正确配置环境变量。

## 🔐 环境变量说明

### 聊天运行时必需

| 变量名                       | 说明                                                         | 必需 |
| ---------------------------- | ------------------------------------------------------------ | ---- |
| `ASTRA_DB_API_ENDPOINT`      | Astra DB Data API 端点                                       | ✅   |
| `ASTRA_DB_APPLICATION_TOKEN` | Astra DB 访问令牌                                            | ✅   |
| `ASTRA_DB_COLLECTION`        | 向量集合名称（须为 2048 维，见 `yarn astra:init-embedding`） | ✅   |
| `GROQ_API_KEY`               | Groq API 密钥，聊天主模型 + RAG 辅助                         | ✅   |
| `NIM_API_KEY`                | NVIDIA NIM API 密钥，embedding                               | ✅   |

### 知识库 / 入库 Worker 需要

| 变量名               | 说明                   | 必需场景                  |
| -------------------- | ---------------------- | ------------------------- |
| `DATABASE_URL`       | PostgreSQL 连接串      | `/kb` 文档 CRUD、异步入库 |
| `REDIS_URL`          | Redis 连接串           | BullMQ 任务队列           |
| `ASTRA_DB_NAMESPACE` | Astra DB Keyspace 名称 | 运行 `yarn seed*` 时需要  |

### 可选配置

| 变量名                                                   | 说明                                                                                  | 默认值              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------- |
| `GOOGLE_GENERATIVE_AI_API_KEY`                           | 备用（当前默认未使用）                                                                | —                   |
| `VECTOR_SEARCH_TIMEOUT_MS`                               | 向量检索主超时（毫秒），含 embedding 与 Astra 查询；超时后另有 10s 宽限期；上限 60000 | `12000`             |
| `EMBEDDING_CACHE_SIZE`                                   | 进程内 embedding LRU 缓存容量                                                         | `100`               |
| `UPSTASH_REDIS_REST_URL`                                 | Upstash Redis REST 地址，用于限流                                                     | 未配置则禁用限流    |
| `UPSTASH_REDIS_REST_TOKEN`                               | Upstash Redis REST Token                                                              | 未配置则禁用限流    |
| `ENABLE_LLM_QUERY_ROUTER`                                | 模糊问法 LLM 路由                                                                     | `true`              |
| `ENABLE_EMBEDDING_ROUTE_PRECHECK`                        | 路由前 embedding Top-1 预检                                                           | `true`              |
| `ENABLE_HYDE` / `ENABLE_MULTI_QUERY` / `ENABLE_RERANKER` | RAG 增强开关                                                                          | `false`             |
| `LANGSMITH_API_KEY`                                      | LangSmith 追踪（检索 + ingest）                                                       | 未配置则关闭        |
| `LANGSMITH_TRACING`                                      | 设为 `true` 启用 LangSmith                                                            | `false`             |
| `LANGSMITH_PROJECT`                                      | LangSmith 项目名                                                                      | `personal-gpt-v1.0` |

## 产品路线图 (Product Roadmap)

**项目愿景**  
从 v0.1 个人 RAG 聊天原型出发，演进为**可生产、多租户、可观测**的企业级知识库平台：文档自助导入与管理、检索可溯源、多 Agent 协作、workspace 隔离与工程化部署。

> 完整版本拆解、任务清单、Reference 映射见 **[docs/enterprise-roadmap.md](./docs/enterprise-roadmap.md)**。

**架构原则**

- 保留并增强 Next.js 前端（聊天 + 知识库工作台）
- v2.0 起引入 Nest.js Agent 服务（LangGraph 多 Agent）
- 异步导入：**BullMQ + Redis**；元数据：**PostgreSQL**；向量：**Astra DB**（v3.0 扩展多存储）
- 可生产能力 v4.0 集中落地，v1.0–v3.0 逐步铺垫

---

### **v0.1 - RAG 聊天原型（已完成）**

#### 核心特性

- 单页聊天界面：快捷建议、消息气泡、Markdown/GFM 渲染、移动端基础适配
- `POST /api/chat` 后端链路：请求校验、最长 8000 字限制、错误 requestId、流式响应
- 智能路由（`query-router`）：意图快路径 + embedding 预检 + LLM 二分类
- 基于 Astra DB 的向量检索：按数据源过滤、相似度阈值过滤、Top-K 上下文注入
- Gemini 多模型 fallback → **Groq** 多模型 fallback：`qwen/qwen3-32b` → `llama-3.3-70b-versatile` → `llama-3.1-8b-instant`
- 默认 5 秒向量检索超时 + 无上下文降级，保障首字体验和服务可用性
- 进程内 embedding 缓存，降低重复查询延迟和 token 成本
- 可选 Upstash Redis 限流：保护 `/api/chat`，本地或缺凭据时 fail-open
- 知识库初始化脚本：支持预设问答、心理学问答、网页抓取与 LangChain 文本切块入库
- Tailwind CSS 4 + React 19 + Next.js 16 现代技术栈
- Vitest/ESLint/TypeScript/build 校验链路与 GitHub Actions CI

#### 当前边界（v0.1 历史说明，已由 v1.0 覆盖大部分）

- v0.1 时期无知识库 UI / 引用展示；**v1.0 已补齐** `/kb`、citation 卡片、BullMQ 导入。
- 仍无：用户系统、聊天历史持久化、多租户 UI。

**当前状态**：v0.1 基线 + **v1.0 核心已封板**（2026-07-03 验收 8/8）。

**链接**：  
[在线演示](https://personal-emotion-gpt.vercel.app) | [GitHub](https://github.com/moyunzero/personal-gpt)

---

### **v1.0 - RAG 基础强化与知识库管理（已封板 ✅）**

**目标**：企业知识库数据层——文档上传、异步入库、知识库 CRUD、聊天引用溯源。

| 模块       | 状态                                                |
| ---------- | --------------------------------------------------- |
| 基础设施   | ✅ Monorepo + Docker Compose + BullMQ Worker        |
| 数据模型   | ✅ workspaceId 全链路                               |
| 文档导入   | ✅ PDF/MD/TXT/DOCX                                  |
| 知识库 UI  | ✅ `/kb` 上传/列表/筛选/CRUD                        |
| RAG        | ✅ 引用 + 三层路由 + 可选 HyDE/Multi-Query/Reranker |
| 工程       | ✅ CI + 回归 8 项 + LangSmith 就绪                  |
| Agent 骨架 | ✅ `yarn dev:agent` 透传                            |

**延期项**：SemanticChunker、MinIO、agent-service Docker 镜像 → v3.0/v4.0

**Reference**：`reference/rag-test`、`advanced-rag`、`typeorm-pg-crud`、`redis-test`、`langsmith-test`

---

### **v2.0 - LangGraph 多 Agent 核心架构**

**目标**：Nest.js Agent 服务 + LangGraph StateGraph，Supervisor 协调 Retriever / Researcher / Analyst / Editor，Skills 动态加载。

- 复杂任务自动分解（To-Do）与多 Agent 协作
- 前端 SSE 流式消费 + 子 Agent 步骤可视化
- v1.0 简单聊天仍走 Next.js `/api/chat`，复杂任务走 Agent 服务

- v1.0 末 Agent 服务骨架已就绪，v2.0 直接填充 LangGraph（见路线图风险说明）

**Reference**：`reference/langgraph-test`、`deep-research-assistant`、`agui-backend`、`agui-frontend`

---

### **v3.0 - 记忆、存储与高级 RAG**

**目标**：Redis 短期记忆 + Mem0/分层长期记忆；Astra + 多存储（Milvus、ES、Neo4j、MinIO）；Agentic RAG + Graph RAG。

**Reference**：`reference/memory-test`、`mem0-test`、`milvus-test`、`es-test`、`neo4j-graphrag`

---

### **v4.0 - 全栈工程化与生产就绪**

**目标**：Docker Compose 一键部署、多租户 workspace、Clerk/Auth.js、限流审计、Prometheus + Grafana、CI/CD。

**Reference**：`reference/nest-dockerfile-test`、`nest-feature`

---

### **v5.0 - 高级企业特性**

语音（ASR/TTS）、定时 Agent、RAGAS 评估、团队协作、语义缓存与模型路由。

**Reference**：`reference/asr-and-tts-nest-service`、`cron-job-tool`、`langsmith-test/src/eval/`

---

**当前进度**：**v1.0 已封板** → 下一步 **v2.0**（LangGraph 多 Agent）。

详细任务拆解、数据模型、API 设计与成功指标见 **[docs/enterprise-roadmap.md](./docs/enterprise-roadmap.md)**。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT](LICENSE)

## 🙏 致谢

- [Next.js](https://nextjs.org/)
- [Vercel AI SDK](https://sdk.vercel.ai/)
- [Groq](https://console.groq.com/)
- [NVIDIA NIM](https://build.nvidia.com/)
- [DataStax Astra DB](https://www.datastax.com/)
- [LangChain](https://www.langchain.com/)

---

Made with ❤️ by [MoYun]
