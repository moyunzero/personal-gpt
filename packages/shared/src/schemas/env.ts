import { z } from "zod";

/**
 * 各 app 共享的环境变量 Zod schema。
 * 启动时校验，缺失关键密钥则进程早 fail，避免请求阶段 silent fail。
 */
export const SharedEnvSchema = z.object({
  ASTRA_DB_COLLECTION: z.string().min(1, "ASTRA_DB_COLLECTION 未设置"),
  ASTRA_DB_API_ENDPOINT: z.string().min(1, "ASTRA_DB_API_ENDPOINT 未设置"),
  ASTRA_DB_APPLICATION_TOKEN: z.string().min(1, "ASTRA_DB_APPLICATION_TOKEN 未设置"),
  /** Google AI Studio API Key（可选；国内不可用时可省略，RAG 辅助已改 Groq） */
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),

  /** Groq API Key；@ai-sdk/groq 聊天主模型（console.groq.com，免费层无需绑卡） */
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY 未设置"),

  /** NVIDIA NIM API Key（build.nvidia.com）；embedding 2048 维 */
  NIM_API_KEY: z.string().min(1, "NIM_API_KEY 未设置"),

  /** 本地 Docker Compose PostgreSQL 连接串 */
  DATABASE_URL: z.string().url().optional(),

  /** 本地 Docker Compose Redis（BullMQ）连接串 */
  REDIS_URL: z.string().url().optional(),

  /**
   * 向量检索总超时（毫秒），从「调 embedding API」到「Astra 查完返回」算一段。
   */
  VECTOR_SEARCH_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(12_000),

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
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(100 * 1024 * 1024)
    .default(20_971_520),

  /**
   * 允许上传的 MIME 白名单。逗号分隔，默认 PDF/MD/TXT/DOCX。
   */
  ALLOWED_MIME_TYPES: z
    .string()
    .optional()
    .transform((v) =>
      (
        v ??
        "application/pdf,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
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

let cachedEnv: SharedEnv | undefined;

/** 延迟解析，避免 monorepo 下 Next/Turbopack worker 尚未加载 .env 时模块 import 即抛错 */
export function getEnv(): SharedEnv {
  if (!cachedEnv) {
    cachedEnv = parseSharedEnv();
  }
  return cachedEnv;
}

/** 兼容现有 `env.X` 访问；首次读属性时才 parse */
export const env: SharedEnv = new Proxy({} as SharedEnv, {
  get(_target, prop: string | symbol) {
    if (typeof prop === "string") {
      return (getEnv() as Record<string, unknown>)[prop];
    }
    return undefined;
  },
});
