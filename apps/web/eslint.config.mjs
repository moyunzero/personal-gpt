import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // 应用层（app/）禁止裸 console.log/info/debug —— 这些应该走 lib/logger.ts
  // 的结构化日志器，便于 Vercel 端按 scope/requestId 过滤。仍放行 console.warn
  // 和 console.error 作为最后一道兜底（比如 logger 自身崩了的边界场景）。
  // lib/ 和 script/ 不受此限制：logger 实现本身需要 console，seed 脚本依赖
  // console 输出进度。
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
]);

export default eslintConfig;
