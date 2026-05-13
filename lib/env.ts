import { z } from "zod";

/**
 * 启动时校验运行时必需的环境变量。
 *
 * 失败时直接抛错，让进程在启动阶段就崩，
 * 而不是在请求里以 `Cannot read properties of undefined` 之类的奇怪错误暴露给用户。
 *
 * 仅校验 `app/api/chat/route.ts` 直接消费的变量。
 * 一次性脚本（script/*）有各自的早 fail 检查，这里不重复覆盖。
 */
const EnvSchema = z.object({
  ASTRA_DB_COLLECTION: z.string().min(1, "ASTRA_DB_COLLECTION 未设置"),
  ASTRA_DB_API_ENDPOINT: z.string().min(1, "ASTRA_DB_API_ENDPOINT 未设置"),
  ASTRA_DB_APPLICATION_TOKEN: z.string().min(1, "ASTRA_DB_APPLICATION_TOKEN 未设置"),
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY 未设置"),

  /**
   * 向量检索总超时（毫秒），从「调 embedding API」到「Astra 查完返回」算一段。
   * 默认 5000 ms 与历史一致；冷起 embedding 1-3s + Astra 200-500ms，留出余量。
   * 当 embedding 缓存命中率高时，可降至 2000-3000 提升 TTFT。
   */
  VECTOR_SEARCH_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5000),

  /**
   * embedding LRU 缓存容量。
   * 取 100 是一个粗略默认值：4 个固定 prompt-suggestion 按钮 + 留余给用户重复提问。
   * 设为 0 在 Zod 这里会被拒（min(1)）；想关缓存请改代码而非配置。
   */
  EMBEDDING_CACHE_SIZE: z.coerce.number().int().min(1).max(10_000).default(100),
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `[env] 必需的环境变量缺失或无效：\n${issues}\n请参考 .env.example 完成本地配置。`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof EnvSchema>;
