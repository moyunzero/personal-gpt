# Google AI 供应商（方案 A）

personal-gpt 的 **聊天** 与 **Embedding** 均通过 [Vercel AI SDK](https://sdk.vercel.ai/) 的 `@ai-sdk/google` 接入 Google Gemini，替代原先的 OpenRouter 免费模型链。

## 模型选型

| 用途 | 模型 | 说明 |
|------|------|------|
| 聊天主模型 | `gemini-2.5-flash` | 中文与长上下文表现好，免费层约 1,500 RPD |
| 聊天兜底 | `gemini-2.5-flash-lite` | 主模型 429 时自动 fallback |
| Embedding | `gemini-embedding-001` | 向量维度 **3072**，与 Astra collection 一致 |
| RAG 辅助（HyDE / Multi-Query） | `gemini-2.5-flash-lite` | 仅在 `rag-options` 开关开启时使用 |

代码入口：

- 聊天：`apps/web/lib/chat/stream.ts`
- 检索 embedding：`apps/web/lib/chat/retrieve.ts` → `packages/shared/src/ai/embeddings.ts`
- 入库 embedding：`apps/ingest-worker/src/ingest/pipeline/embed.ts`

## 环境变量

在根目录 `.env` 中配置：

```env
GOOGLE_GENERATIVE_AI_API_KEY=<从 Google AI Studio 获取>
```

获取地址：<https://aistudio.google.com/apikey>

`@ai-sdk/google` 会自动读取 `GOOGLE_GENERATIVE_AI_API_KEY`，无需额外 SDK 初始化。

### 免费层说明

- 免费 tier 有日请求与 TPM 限制，具体以 [Google AI 定价页](https://ai.google.dev/pricing) 为准。
- 免费层数据可能被 Google 用于改进产品；生产环境建议评估付费 tier。
- 相比 OpenRouter 免费层（约 50 次/天），Gemini 免费额度更适合本地开发与验收。

## 从 OpenRouter 迁移（重要）

旧版使用 OpenRouter + `nvidia/llama-nemotron-embed-vl-1b-v2`（**2048 维**）。新版 embedding 为 **3072 维**，**不能与旧 Astra collection 混用**。

### 迁移步骤

1. **更新 `.env`**
   - 添加 `GOOGLE_GENERATIVE_AI_API_KEY`
   - 可移除 `OPENROUTER_API_KEY`（已不再使用）

2. **新建或重建 Astra collection**

   ```bash
   yarn astra:init-gemini   # 创建 db_emotion_gemini（3072 维）
   ```

   - 将 `.env` 中 `ASTRA_DB_COLLECTION` 改为 `db_emotion_gemini`（或在 Portal 手动创建 3072 维 collection）

3. **重新导入向量数据**（任选需要的脚本）

   ```bash
   yarn seed:suggestions      # 预设问答（推荐）
   yarn migrate:legacy        # Phase 1 遗留数据迁入 PG + Astra
   yarn seed:psychology       # 心理学问答（可选，数据量大）
   yarn seed                  # 网页抓取入库（可选）
   ```

4. **知识库已上传文档**：在 `/kb` 页面删除后重新上传，或触发重新索引，让 ingest-worker 用新 embedding 写入 Astra。

5. **启动服务验证**

   ```bash
   yarn docker:up
   yarn workspace web migration:run
   yarn dev:web
   yarn dev:worker
   ```

### 常见错误

| 现象 | 原因 | 处理 |
|------|------|------|
| Astra 写入/检索失败、维度错误 | collection 仍为 2048 维 | 新建 3072 维 collection 并重建索引 |
| 聊天无回复、429 | Gemini 免费配额用尽 | 等待重置或升级付费；检查 AI Studio 用量 |
| 检索无 citation | 向量库为空或维度不匹配 | 确认 `migrate:legacy` / 上传入库已完成 |
| `GOOGLE_GENERATIVE_AI_API_KEY 未设置` | 未配置 env | 参考 `.env.example` |

## 架构示意

```text
用户提问
  → /api/chat
    → retrieve: embedText (Gemini embedding) → Astra 向量检索
    → streamText (Gemini flash) → SSE 流式回复 + citations
文档上传
  → BullMQ ingest-worker
    → embedTexts (Gemini embedding) → Astra upsert
```

## 相关依赖

- `apps/web`：`@ai-sdk/google`、`ai`
- `packages/shared`：`@ai-sdk/google`、`ai`（embedding 与 RAG 辅助共用）
- 已移除：`@openrouter/ai-sdk-provider`、运行时对 `openai` 包的依赖
