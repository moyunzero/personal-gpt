import path from "node:path";

import { config } from "dotenv";

/**
 * Web 应用环境变量：复用 @personal-gpt/shared 的 Zod schema。
 * Monorepo 下 .env 在仓库根目录，必须在 import shared 前加载。
 */
config({ path: path.resolve(__dirname, "../../../.env") });

export {
  env,
  getEnv,
  parseSharedEnv,
  SharedEnvSchema,
  type SharedEnv as Env,
} from "@personal-gpt/shared/schemas/env";
