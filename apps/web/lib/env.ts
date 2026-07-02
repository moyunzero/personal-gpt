/**
 * Web 应用环境变量：复用 @personal-gpt/shared 的 Zod schema，避免双份定义。
 */
export { env, parseSharedEnv, SharedEnvSchema, type SharedEnv as Env } from "@personal-gpt/shared/schemas/env";
