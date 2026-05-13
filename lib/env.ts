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
