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
yarn seed
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

# 初始化数据库
yarn seed

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
