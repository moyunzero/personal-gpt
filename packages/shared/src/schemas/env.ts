import { z } from "zod";

/**
 * 各 app 共享的环境变量 Zod schema。
 * 启动时校验，缺失关键密钥则进程早 fail，避免请求阶段 silent fail。
 */
export const SharedEnvSchema = z
  .object({
    ASTRA_DB_COLLECTION: z.string().min(1).optional(),
    ASTRA_DB_API_ENDPOINT: z.string().min(1).optional(),
    ASTRA_DB_APPLICATION_TOKEN: z.string().min(1).optional(),

    /** Corpus 分库（D-24）：用户上传 / 种子库物理隔离；未设时回退 ASTRA_DB_COLLECTION */
    ASTRA_DB_COLLECTION_USER: z.string().min(1).optional(),
    ASTRA_DB_COLLECTION_SEED: z.string().min(1).optional(),

    /** Elasticsearch BM25（D-14）；本地 Compose 默认 http://localhost:9200 */
    ES_NODE: z.string().url().default("http://localhost:9200"),
    ES_INDEX_USER: z.string().min(1).default("kb_user"),
    ES_INDEX_SEED: z.string().min(1).default("kb_seed"),

    /**
     * 向量后端（Wave3 STORE-01）。默认 astra；设 milvus 时走本地/自托管 Milvus。
     */
    VECTOR_BACKEND: z.enum(["astra", "milvus"]).default("astra"),

    /** Milvus gRPC 地址（Compose 默认 localhost:19530） */
    MILVUS_ADDRESS: z.string().min(1).default("localhost:19530"),

    /** Milvus collection；未设时回退 Astra corpus collection 名 */
    MILVUS_COLLECTION_USER: z.string().min(1).optional(),
    MILVUS_COLLECTION_SEED: z.string().min(1).optional(),

    /**
     * Astra 默认时是否额外双写 Milvus（可选；VECTOR_BACKEND=milvus 时主写 Milvus）。
     */
    MILVUS_DUAL_WRITE: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),

    /** Neo4j Bolt URI（Wave4 Graph RAG；Compose 默认 bolt://localhost:7687） */
    NEO4J_URI: z.string().min(1).default("bolt://localhost:7687"),
    NEO4J_USER: z.string().min(1).default("neo4j"),
    NEO4J_PASSWORD: z.string().min(1).default("personal_gpt_neo4j"),

    /** App-layer RRF rank constant k（经典 ≈60） */
    RRF_K: z.coerce.number().int().min(1).max(200).default(60),

    /**
     * Dedicated rerank HTTP（OpenRouter/Cohere 兼容）。
     * ENABLE_RERANKER 默认开（非 "false" 即启用）；Wave1c / 03-03 再统一切 Chat 调用点。
     */
    ENABLE_RERANKER: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v !== "false"),
    RERANK_URL: z.string().url().optional(),
    RERANK_API_KEY: z.string().min(1).optional(),
    RERANK_MODEL: z.string().min(1).optional(),

    /** Corrective 阈值（plan 03-03）；schema 先接受，本 plan 不接线 */
    CORRECTIVE_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.35),

    /** Google AI Studio API Key（可选；国内不可用时可省略，RAG 辅助已改 Groq） */
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),

    /**
     * Groq API Key（默认聊天主模型）。与 OPENAI_API_KEY 至少配置其一。
     * VPN 地区限制时可改用 CHAT_PROVIDER=openai + OPENAI_*。
     */
    GROQ_API_KEY: z.string().min(1).optional(),

    /**
     * OpenAI 或兼容网关（Chat / Agent 共用）。
     * Chat：CHAT_PROVIDER=openai；Agent：AGENT_PROVIDER=openai。
     */
    OPENAI_API_KEY: z.string().min(1).optional(),
    /** OpenAI 兼容 baseURL，例如中转网关 `https://gateway.example/v1` */
    OPENAI_BASE_URL: z.string().url().optional(),

    /** Chat 强制供应商：groq | openai；未设则 groq → openai */
    CHAT_PROVIDER: z.enum(["groq", "openai"]).optional(),

    /** Chat fallback 模型列表（逗号分隔）；覆盖 Groq 默认三档 / OpenAI 单模型 */
    CHAT_MODELS: z.string().min(1).optional(),

    /** OpenAI 模式下默认单模型（CHAT_MODELS 未设时）；也可用 AGENT_MODEL */
    OPENAI_CHAT_MODEL: z.string().min(1).optional(),

    /** RAG 辅助模型覆盖（路由 / HyDE 等）；默认 Groq 8B 或 OpenAI 列表首项 */
    CHAT_RAG_HELPER_MODEL: z.string().min(1).optional(),

    /** NVIDIA NIM API Key（build.nvidia.com）；embedding 2048 维 */
    NIM_API_KEY: z.string().min(1, "NIM_API_KEY 未设置"),

    /** 本地 Docker Compose PostgreSQL 连接串 */
    DATABASE_URL: z.string().url().optional(),

    /** 本地 Docker Compose Redis（BullMQ）连接串 */
    REDIS_URL: z.string().url().optional(),

    /** 短期记忆保留最近 N 轮（D-17）；默认 10 */
    SHORT_MEMORY_N: z.coerce.number().int().min(1).max(100).default(10),

    /** Redis 短期记忆键前缀（D-18）；最终键 = prefix:workspaceId:userKey */
    MEMORY_KEY_PREFIX: z.string().min(1).default("pgpt:short_memory"),

    /** Mem0 长期记忆（D-16）；未设 key 时 search/add 降级为空 */
    MEM0_API_KEY: z.string().min(1).optional(),
    MEM0_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v !== "false"),

    /**
     * 向量检索总超时（毫秒），从「调 embedding API」到「Astra 查完返回」算一段。
     */
    VECTOR_SEARCH_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(12_000),

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
    /** Agent 流量建议 `personal-gpt-agent`（D-18） */
    LANGSMITH_PROJECT: z.string().min(1).optional(),

    /** KB API Bearer 鉴权；未设则本地 dev 放行 */
    KB_ADMIN_TOKEN: z.string().min(1).optional(),

    /** agent-service → web /api/chat 内部代理密钥 */
    INTERNAL_PROXY_KEY: z.string().min(1).optional(),

    /**
     * LangGraph recursionLimit 硬护栏（D-15）。默认 40。
     */
    AGENT_RECURSION_LIMIT: z.coerce.number().int().min(1).max(200).default(40),

    /**
     * Checkpointer 后端（D-20/D-21）。默认 postgres；memory|sqlite 仅测试或无 PG。
     */
    AGENT_CHECKPOINTER: z.enum(["memory", "sqlite", "postgres"]).default("postgres"),

    /** PostgresSaver schema（可选；默认 public） */
    AGENT_CHECKPOINT_SCHEMA: z.string().min(1).optional(),

    /**
     * 启用的 Skills 列表（D-12/D-13）。逗号分隔，默认三件套。
     */
    ENABLED_SKILLS: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? "kb-retrieval,web-research,report-writer")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),

    /** Bocha 联网搜索（D-14）；未配则 Researcher 降级 */
    BOCHA_API_KEY: z.string().min(1).optional(),

    /**
     * Agent 临时内部令牌（v2.x）。设置后 POST /agent/chat 需 Bearer；
     * web 经 `/api/agent/chat` BFF 注入。正式身份/ACL 见 v4。
     */
    AGENT_INTERNAL_TOKEN: z.string().min(1).optional(),

    /** 服务端转发 agent-service 基址（BFF 用；优先于 NEXT_PUBLIC_*） */
    AGENT_SERVICE_URL: z.string().url().optional(),

    /**
     * 前端 Agent 模式遗留直连基址（仅 NEXT_PUBLIC_* 可暴露给 client）。
     * v2.x 起浏览器默认走 `/api/agent/chat` BFF；未配置时保持 undefined。
     */
    NEXT_PUBLIC_AGENT_SERVICE_URL: z.string().url().optional(),

    /** v0.1 无 workspaceId 的 Astra chunk 回退检索；默认关闭 */
    ASTRA_LEGACY_FALLBACK: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),

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
  })
  .superRefine((data, ctx) => {
    const provider =
      data.CHAT_PROVIDER ?? (data.GROQ_API_KEY ? "groq" : data.OPENAI_API_KEY ? "openai" : null);
    if (!provider) {
      ctx.addIssue({
        code: "custom",
        path: ["GROQ_API_KEY"],
        message: "请设置 GROQ_API_KEY，或 OPENAI_API_KEY（可选 CHAT_PROVIDER / OPENAI_BASE_URL）",
      });
      return;
    }
    if (provider === "groq" && !data.GROQ_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GROQ_API_KEY"],
        message: "CHAT_PROVIDER=groq 时必须设置 GROQ_API_KEY",
      });
    }
    if (provider === "openai" && !data.OPENAI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "CHAT_PROVIDER=openai 时必须设置 OPENAI_API_KEY",
      });
    }
    const needsAstra = data.VECTOR_BACKEND === "astra" || data.MILVUS_DUAL_WRITE === true;
    if (needsAstra) {
      for (const field of [
        "ASTRA_DB_COLLECTION",
        "ASTRA_DB_API_ENDPOINT",
        "ASTRA_DB_APPLICATION_TOKEN",
      ] as const) {
        if (!data[field]?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `VECTOR_BACKEND=astra 或 MILVUS_DUAL_WRITE=true 时必须设置 ${field}`,
          });
        }
      }
    }
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
