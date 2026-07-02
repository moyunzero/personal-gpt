import { z } from "zod";

/**
 * 各 app 共享的环境变量 Zod schema。
 * 启动时校验，缺失关键密钥则进程早 fail，避免请求阶段 silent fail。
 */
export const SharedEnvSchema = z.object({
  ASTRA_DB_COLLECTION: z.string().min(1, "ASTRA_DB_COLLECTION 未设置"),
  ASTRA_DB_API_ENDPOINT: z.string().min(1, "ASTRA_DB_API_ENDPOINT 未设置"),
  ASTRA_DB_APPLICATION_TOKEN: z.string().min(1, "ASTRA_DB_APPLICATION_TOKEN 未设置"),
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY 未设置"),

  /** 本地 Docker Compose PostgreSQL 连接串 */
  DATABASE_URL: z.string().url().optional(),

  /** 本地 Docker Compose Redis（BullMQ）连接串 */
  REDIS_URL: z.string().url().optional(),

  /**
   * 向量检索总超时（毫秒），从「调 embedding API」到「Astra 查完返回」算一段。
   */
  VECTOR_SEARCH_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5000),

  /** embedding LRU 缓存容量 */
  EMBEDDING_CACHE_SIZE: z.coerce.number().int().min(1).max(10_000).default(100),

  /**
   * Upstash Redis 用于限流。两者全部设置时启用，否则 fail-open。
   */
  UPSTASH_REDIS_REST_URL: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  /** LangSmith 追踪（ENG-01，可选） */
  LANGSMITH_TRACING: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  LANGSMITH_API_KEY: z.string().min(1).optional(),
  LANGSMITH_PROJECT: z.string().min(1).optional(),

  /** 单文件上传上限，默认 20MB（D-13） */
  UPLOAD_MAX_BYTES: z.coerce.number().int().min(1).max(100 * 1024 * 1024).default(20_971_520),

  /**
   * 允许上传的 MIME 白名单。逗号分隔，默认 PDF/MD/TXT/DOCX。
   */
  ALLOWED_MIME_TYPES: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "application/pdf,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
});

export type SharedEnv = z.infer<typeof SharedEnvSchema>;

export function parseSharedEnv(source: NodeJS.ProcessEnv = process.env): SharedEnv {
  const parsed = SharedEnvSchema.safeParse(source);
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

/** 模块加载时解析一次，与 v0.1 apps/web/lib/env.ts 行为一致 */
export const env = parseSharedEnv();
