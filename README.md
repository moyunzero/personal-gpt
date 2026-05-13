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
- **LLM 提供商**：[OpenRouter](https://openrouter.ai/)（多模型 fallback，当前代码以 Ring / GPT-OSS / Nemotron 免费模型为主）
- **向量数据库**：[DataStax Astra DB](https://www.datastax.com/products/datastax-astra) Data API
- **Embedding**：OpenRouter 上的 NVIDIA Llama Nemotron Embed
- **限流（可选）**：Upstash Redis + `@upstash/ratelimit`
- **样式**：Tailwind CSS 4
- **语言与质量**：TypeScript, Zod, Vitest, ESLint
- **内容渲染**：React Markdown + remark-gfm
- **数据导入脚本**：LangChain（仅用于脚本侧网页抓取、切块与入库）

## 📋 前置要求

- Node.js 20+
- Yarn 或 npm
- DataStax Astra DB 账户
- OpenRouter API 密钥

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd personal-gpt
```

### 2. 安装依赖

```bash
yarn install
# 或
npm install
```

### 3. 配置环境变量

在项目根目录创建 `.env` 文件：

```env
# Astra DB 配置
ASTRA_DB_API_ENDPOINT=your_astra_db_endpoint
ASTRA_DB_APPLICATION_TOKEN=your_astra_db_token
ASTRA_DB_NAMESPACE=your_namespace
ASTRA_DB_COLLECTION=your_collection_name

# OpenRouter API
OPENROUTER_API_KEY=your_openrouter_api_key
```

### 4. 初始化数据库（可选）

如果需要导入知识库数据：

```bash
# 导入预设问题答案（个人/项目介绍）- 推荐先跑
yarn seed:suggestions

# 导入心理学问答数据（可选，数据量大）
yarn seed:psychology

# 从网页抓取内容、切块并写入 Astra（需要配置 ASTRA_DB_NAMESPACE）
yarn seed
```

### 5. 启动开发服务器

```bash
yarn dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看应用。

## 📁 项目结构

```text
personal-gpt/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # AI 聊天 API 端点
│   ├── components/
│   │   ├── Bubble.tsx            # 消息气泡组件
│   │   ├── LoadingBubble.tsx     # 加载动画组件
│   │   ├── PromptSuggestionButton.tsx
│   │   └── PromptSuggestionsRow.tsx
│   ├── globals.css               # 全局样式
│   ├── layout.tsx                # 根布局
│   └── page.tsx                  # 主页面
├── script/
│   └── loadDB.ts                 # 数据库初始化脚本
├── public/                       # 静态资源
└── package.json
```

## 🔧 核心功能说明

### RAG 检索增强生成

应用使用智能判断机制决定是否需要向量搜索：

- **简单问候**：直接使用 LLM 回答
- **知识查询**：触发向量搜索，检索相关上下文
- **超时保护**：默认 5 秒向量检索超时，可通过 `VECTOR_SEARCH_TIMEOUT_MS` 调整，超时后自动降级到无上下文模式

### 向量搜索优化

- 使用 NVIDIA Llama Nemotron Embed 模型生成嵌入向量
- 相似度阈值：普通查询 0.65，快捷建议类查询 0.55
- 普通查询返回前 3 个最相关文档，快捷建议类查询最多返回 5 个
- 内置 embedding LRU 缓存，减少重复问题的首字延迟
- 可选 Upstash Redis 按 IP 限流（10 次 / 60 秒），未配置时自动放行，方便本地开发
- 智能降级策略确保服务可用性

## 📝 可用脚本

```bash
# 开发模式
yarn dev

# 构建生产版本
yarn build

# 启动生产服务器
yarn start

# 导入预设问题答案（个人知识库）
yarn seed:suggestions

# 导入心理学问答数据
yarn seed:psychology

# 运行单元测试
yarn test

# 类型检查
yarn type-check

# 代码检查
yarn lint

# 完整校验：类型检查 + lint + test + build
yarn validate
```

## 🌐 部署

### Vercel 部署（推荐）

1. 将代码推送到 GitHub
2. 在 [Vercel](https://vercel.com) 导入项目
3. 配置环境变量
4. 部署

### 其他平台

确保平台支持 Next.js 16+ 和 Node.js 20+，并正确配置环境变量。

## 🔐 环境变量说明

### 聊天运行时必需

| 变量名 | 说明 | 必需 |
| --- | --- | --- |
| `ASTRA_DB_API_ENDPOINT` | Astra DB Data API 端点 | ✅ |
| `ASTRA_DB_APPLICATION_TOKEN` | Astra DB 访问令牌 | ✅ |
| `ASTRA_DB_COLLECTION` | 向量集合名称 | ✅ |
| `OPENROUTER_API_KEY` | OpenRouter API 密钥，用于聊天模型和 embedding | ✅ |

### 数据导入脚本需要

| 变量名 | 说明 | 必需场景 |
| --- | --- | --- |
| `ASTRA_DB_NAMESPACE` | Astra DB Keyspace 名称 | 运行 `yarn seed*` 时需要 |

### 可选配置

| 变量名 | 说明 | 默认值 |
| --- | --- | --- |
| `VECTOR_SEARCH_TIMEOUT_MS` | 向量检索总超时，包含 embedding 与 Astra 查询 | `5000` |
| `EMBEDDING_CACHE_SIZE` | 进程内 embedding LRU 缓存容量 | `100` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST 地址，用于限流 | 未配置则禁用限流 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token | 未配置则禁用限流 |

## 产品路线图 (Product Roadmap)

**项目愿景**  
打造一个**高准确率、可自托管、隐私边界清晰**的个人第二大脑式 AI 聊天助手：先解决“把个人资料变成可追问知识库”的核心体验，再逐步补齐历史、引用、评估、安全和协作能力。

---

### **v0.1 - RAG 聊天原型（已完成）**

#### 核心特性

- 单页聊天界面：快捷建议、消息气泡、Markdown/GFM 渲染、移动端基础适配
- `POST /api/chat` 后端链路：请求校验、最长 8000 字限制、错误 requestId、流式响应
- 智能检索判断（`shouldUseVectorSearch`）：区分闲聊与知识查询，减少无效向量调用
- 基于 Astra DB 的向量检索：按数据源过滤、相似度阈值过滤、Top-K 上下文注入
- OpenRouter 多模型 fallback：优先使用可流式模型，失败时自动切换兜底模型
- 默认 5 秒向量检索超时 + 无上下文降级，保障首字体验和服务可用性
- 进程内 embedding 缓存，降低重复查询延迟和 token 成本
- 可选 Upstash Redis 限流：保护 `/api/chat`，本地或缺凭据时 fail-open
- 知识库初始化脚本：支持预设问答、心理学问答、网页抓取与 LangChain 文本切块入库
- Tailwind CSS 4 + React 19 + Next.js 16 现代技术栈
- Vitest/ESLint/TypeScript/build 校验链路与 GitHub Actions CI

#### 当前边界

- 目前只有首页聊天和一个聊天 API，尚无用户系统、聊天历史持久化、文件上传、引用 UI、设置页或知识库管理界面。
- 检索结果只在服务端作为上下文注入 prompt，前端还不会展示“引用来源”。
- LangChain 只用于数据导入脚本，不在运行时聊天链路中执行。

**当前状态**：可作为个人 RAG 聊天原型使用，适合继续围绕“知识导入、检索可信度、会话管理”打磨。

**链接**：  
[在线演示](https://personal-emotion-gpt.vercel.app) | [GitHub](https://github.com/moyunzero/personal-gpt)

---

### **v0.2 - 对话体验与可信回答**

目标：先把用户每天真正会用到的聊天体验打磨好，让“问得舒服、答得可信、出错可理解”。

#### v0.2 计划特性

- **引用来源展示**：把服务端检索到的文档标题、来源、相似度和片段返回给前端，回答下方显示引用卡片。
- **消息操作补齐**：复制、重新生成、编辑后重问、错误重试、停止生成。
- **对话状态优化**：更清晰的 loading / streaming / error / rate limit 状态，展示 requestId 便于排查。
- **移动端体验升级**：输入框、安全区、消息宽度、长内容滚动和快捷问题布局优化。
- **基础主题能力**：深色/浅色主题切换，保证 Markdown、代码块和引用卡片在两种主题下都可读。
- **反馈闭环**：点赞/点踩 + 简短原因收集，为后续 RAG 评估提供真实样本。

#### v0.2 成功指标

- 用户能明确看出回答依据来自哪些资料。
- 常见网络错误、限流、模型 fallback 失败都有可理解的提示。
- 移动端完成一次完整问答不需要横向滚动或缩放。

---

### **v0.3 - 知识库导入与管理**

目标：从“开发者脚本入库”升级为“普通用户也能维护自己的知识库”。

#### v0.3 计划特性

- **文件上传入库**：优先支持 Markdown、TXT、PDF；上传后自动解析、切块、embedding、写入 Astra。
- **网页/URL 导入界面化**：把现有脚本能力产品化，支持单 URL 导入、状态展示和失败重试。
- **轻量多来源连接器**：
  - GitHub 仓库/文件导入
  - Notion 页面/数据库轻量导入（OAuth 或 token）
  - URL 批量抓取增强
- **文档列表管理**：查看已索引文档、来源、更新时间、chunk 数量、删除和重新索引。
- **元数据标准化**：为文档补齐 title、source、category、tags、createdAt、updatedAt 等字段。
- **导入队列与进度**：大文件或网页抓取异步处理，避免阻塞聊天接口。
- **去重与版本控制**：同一文档重复上传时提示覆盖、保留版本或跳过。
- **基础上传安全**：文件大小/类型校验、内容初步扫描
- **知识库隔离基础**（userId 过滤准备，检索时强制过滤）

#### v0.3 成功指标

- 非技术用户能在页面内完成“上传资料 → 提问 → 看到引用”的完整闭环。
- 文档导入失败可定位原因，不需要直接看终端日志。

---

### **v0.4 - 会话历史与个人工作台**

目标：让 Personal GPT 从一次性聊天页变成可长期使用的个人知识工作台。

#### v0.4 计划特性

- **聊天历史持久化**：保存多会话记录，支持新建、切换、重命名、删除和搜索。
- **会话侧边栏**：桌面端侧边栏、移动端抽屉，快速回到历史问题。
- **设置中心**：模型选择、temperature、检索开关、Top-K、相似度阈值、超时时间等参数可配置。
- **个人仪表盘**：对话次数、token 估算、检索命中率、模型失败率、平均首字时间。
- **自动组织知识**：
  - 自动标签生成
  - 相似文档聚类与主题视图
  - 知识关系推荐（“相关文档”）
  - 基于 embedding + LLM 的关联发现
- **导出与分享**：导出 Markdown/PDF；生成只读分享链接作为可选能力。
- **本地/服务端存储选型**：短期可用浏览器存储过渡，正式版本引入数据库持久化。

#### v0.4 成功指标

- 用户可以持续维护多个主题的对话，不会因为刷新页面丢失上下文。
- 设置项能帮助高级用户调试检索效果，但默认配置对新用户依然开箱即用。

---

### **v0.5 - RAG 质量、评估与成本优化**

目标：用评估和监控驱动优化，而不是只凭主观感觉调整 prompt。

#### v0.5 计划特性

- **RAG 测试集**：沉淀标准问题、期望引用、不可回答样例和回归测试脚本。
- **检索质量指标**：命中率、Top-K 相关性、引用覆盖率、无资料时拒答率。
- **结果重排序（Reranking）**：在 Astra 初筛后增加 reranker，提升引用质量。
- **更好的 chunking 策略**：按标题、章节、语义边界切块，并保留上下文窗口。
- **Prompt 与上下文压缩**：减少无关上下文，控制 token 成本，提升长文档问答稳定性。
- **语义缓存**：缓存高频相似问题，降低延迟和 OpenRouter 调用成本。
- **模型对比实验**：对比不同 OpenRouter 模型在速度、成本、稳定性和回答质量上的表现。

#### v0.5 成功指标

- 能用固定评估集证明检索质量和回答质量有提升。
- 平均首字时间、失败率、token 成本都有可观测数据。

---

### **v0.6 - 账号、安全与多知识库隔离**

目标：从个人本地/单实例工具，升级为可以安全分享给他人使用的产品。

#### v0.6 计划特性

- **用户认证系统**：集成 Clerk、Auth.js 或同类方案，支持登录、注册、OAuth。
- **知识库隔离**：按 userId / workspaceId 过滤文档，避免跨用户泄露。
- **权限模型**：个人、共享只读、共享可编辑三类基础权限。
- **Prompt Injection 防护**：对检索上下文做隔离标记、可疑指令过滤和系统提示加固。
- **输入与输出安全**：上传文件大小限制、类型校验、内容安全策略、Markdown 渲染安全审查。
- **密钥与隐私说明**：明确哪些数据会发送到 OpenRouter、Astra、Upstash，以及如何自托管。

#### v0.6 成功指标

- 多用户数据不会交叉检索或展示。
- README 和产品界面都能清楚说明数据流向与隐私边界。

---

### **v1.0 - 可自托管的个人/团队知识助手**

**核心目标**：成为可自托管、可扩展、可评估的生产级个人/团队知识工具。

#### v1.0 计划特性

- **自托管部署**：Docker / Docker Compose，一键配置 Web、数据库、Redis、向量库接入。
- **多模型面板**：OpenRouter 模型自由切换，支持速度、成本、上下文长度维度的推荐。
- **第三方知识源集成**：Notion、GitHub 仓库、网页收藏、浏览器插件、文件夹同步。
- **团队空间**：多人共同维护知识库，支持成员、角色、审计日志和共享会话。
- **可观测性**：结构化日志、检索链路追踪、模型失败率、成本统计，可接入 LangSmith / Helicone 等工具。
- **Agentic RAG**：AI 可自主拆解问题、多轮检索、对比来源并给出带证据的总结。
- **多模态能力**：图片、截图、PDF 图表理解；语音输入和 TTS 作为增强交互。

#### 长期垂直方向探索

- **个人第二大脑**：笔记、网页、文件统一问答。
- **代码助手版**：代码仓库 RAG、架构解释、变更影响分析。
- **小团队知识库**：内部制度、项目文档、FAQ、客户支持知识沉淀。

---

**当前进度**：**v0.1 已完成**，下一步建议优先推进 **v0.2 引用来源展示 + 消息操作 + 移动端体验优化**。这些改动直接建立在现有 `/api/chat` 和单页聊天 UI 上，投入较小，用户感知最强。

你希望优先实现哪个功能？欢迎在 Issues 中提出建议或需求！

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT](LICENSE)

## 🙏 致谢

- [Next.js](https://nextjs.org/)
- [Vercel AI SDK](https://sdk.vercel.ai/)
- [OpenRouter](https://openrouter.ai/)
- [DataStax Astra DB](https://www.datastax.com/)
- [LangChain](https://www.langchain.com/)

---

Made with ❤️ by [MoYun]
