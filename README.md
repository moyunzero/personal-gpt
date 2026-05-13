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

- **前端框架**：[Next.js 16](https://nextjs.org/) + React 19
- **AI SDK**：[Vercel AI SDK](https://sdk.vercel.ai/)
- **LLM 提供商**：[OpenRouter](https://openrouter.ai/) (MiniMax M2.5)
- **向量数据库**：[DataStax Astra DB](https://www.datastax.com/products/datastax-astra)
- **样式**：Tailwind CSS 4
- **语言**：TypeScript
- **其他工具**：LangChain, Zod, React Markdown

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
# 导入预设问题答案（个人/项目介绍）- 推荐
yarn seed:suggestions

# 导入心理学问答数据（可选，数据量大）
yarn seed:psychology

# 测试向量搜索效果
yarn test:search
```

### 5. 启动开发服务器

```bash
yarn dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看应用。

## 📁 项目结构

```
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
- **超时保护**：3 秒超时，自动降级到无上下文模式

### 向量搜索优化

- 使用 NVIDIA Llama Nemotron Embed 模型生成嵌入向量
- 相似度阈值：0.65
- 返回前 3 个最相关文档
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

# 测试向量搜索效果
yarn test:search

# 代码检查
yarn lint
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

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `ASTRA_DB_API_ENDPOINT` | Astra DB API 端点 | ✅ |
| `ASTRA_DB_APPLICATION_TOKEN` | Astra DB 访问令牌 | ✅ |
| `ASTRA_DB_NAMESPACE` | 数据库命名空间 | ✅ |
| `ASTRA_DB_COLLECTION` | 集合名称 | ✅ |
| `OPENROUTER_API_KEY` | OpenRouter API 密钥 | ✅ |

## 产品路线图 (Product Roadmap)

**项目愿景**  
打造一个**高准确率、个性化、隐私安全**的个人第二大脑式 AI 聊天助手。

---

### **v0.1 - 基础原型（已完成）**

**核心特性**
- 基于 Astra DB 的向量检索 RAG 系统
- 智能检索判断（`shouldUseVectorSearch`）：自动识别闲聊 vs 知识查询，减少无效调用
- Vercel AI SDK 流式响应（实时打字效果）
- 3秒向量检索超时自动降级机制（保障体验）
- Markdown 格式化回复 + 响应式聊天界面
- 知识库初始化脚本（`yarn seed`）：支持网页抓取 + LangChain 文本切块入库
- 使用 OpenRouter + MiniMax M2.5 模型
- Tailwind CSS 4 + React 19 + Next.js 16 现代技术栈

**当前状态**：已部署 Vercel，可作为个人知识助手日常使用。

**链接**：  
[在线演示](https://personal-emotion-gpt.vercel.app) | [GitHub](https://github.com/moyunzero/personal-gpt)

---

### **v0.2 - 基础完善**

目标：让项目从“可用”变为“好用”，大幅提升日常体验。

**计划特性**
- **文件实时上传**：支持 PDF、TXT、Markdown、Word 等格式，上传后自动解析、切块、存入向量库
- **聊天历史持久化**：保存多会话记录，支持新建、切换、重命名、删除、搜索历史
- **消息增强操作**：复制、编辑、点赞/差评（用于未来反馈优化）
- **检索来源引用**：回复中显示参考文档标题与片段，并支持点击高亮或跳转
- **UI/UX 全面优化**：
  - 暗黑/亮色主题切换
  - 移动端友好适配 + 侧边栏历史列表
  - 设置页面（模型选择、检索参数调整）
- **基础知识库管理**：查看已索引文档列表、单条删除、手动重新索引

**成功指标**：用户能轻松管理个人文档和对话历史，单次对话体验流畅自然。

---

### **v0.3 - RAG 质量与性能提升**

目标：显著提高回答准确率和相关性，成为同类项目中的高质量方案。

**计划特性**
- **高级检索策略**：Hybrid Search（向量相似度 + 关键词 BM25）
- **结果重排序（Reranking）**：提升 Top 结果的相关性
- **智能 Chunking**：Semantic Chunking + 元数据增强（标题、章节、来源）
- **Prompt 工程优化**：角色设定、Few-shot 示例、输出格式控制、上下文压缩
- **Semantic Cache**：缓存相似问题，降低延迟和 Token 消耗
- **评估与监控**：内置测试集、回答质量评估指标（相关性、幻觉率、Token 使用统计）
- **多知识库切换**：支持不同项目/领域知识库快速切换

**成功指标**：检索准确率提升 30%+。

---

### **v0.4 - 用户体系与安全**

目标：从个人工具升级为可安全分享、多人使用的产品。

**计划特性**
- **用户认证系统**：集成 Clerk 或 NextAuth（登录、注册、OAuth）
- **知识库隔离**：每个用户独立知识库（userId 过滤或独立 Collection）
- **隐私与安全**：
  - Prompt Injection 防护
  - 输入验证与内容安全过滤
  - 文档私有/公开分享控制
- **使用仪表盘**：Token 消耗统计、对话次数、费用预估
- **对话分享**：生成公开链接、导出 Markdown/PDF

---

### **v0.5 - 多模态与 Agent 能力**

目标：向成熟 AI 助手看齐，具备主动智能。

**计划特性**
- **多模态输入**：图片上传、PDF 图表/截图分析、视觉问答
- **工具调用（Tool Use）**：网页搜索、计算器、日历、笔记保存等工具
- **Agent 模式**：ReAct / Plan-and-Execute 多步推理
- **记忆系统**：短期会话记忆 + 长期向量记忆（关键事实提取）
- **语音交互**：语音输入 + TTS 语音输出

---

### **v1.0 - 生产级成熟版**

**核心目标**：成为可自托管、可扩展的生产级个人/团队知识工具。

**计划特性**
- 前端生成式 UI（AI 可生成或修改界面组件）
- 实时协作（多人共同维护同一知识库）
- 高级集成：GitHub 仓库同步、Notion 导入、浏览器插件
- 可观测性：LangSmith / Helicone 集成、详细日志与监控
- 支持 Docker 自托管 + 多模型自由切换面板
- A/B 测试框架（不同检索策略、模型对比）
- Agentic RAG（AI 自主规划多轮检索与推理）

**垂直方向探索**：
- 代码助手版（支持代码仓库 RAG + 代码解释）
- 个人笔记第二大脑
- 小团队内部知识管理平台

---

**当前进度**：**v0.1 已完成**，正在规划 v0.2 开发。

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
