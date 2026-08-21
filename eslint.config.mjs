import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/** 非 Next.js 工作区：shared / NestJS apps / scripts / tests */
const tsFiles = [
  "packages/**/*.{ts,tsx}",
  "apps/ingest-worker/**/*.{ts,tsx}",
  "apps/agent-service/**/*.{ts,tsx}",
  "script/**/*.{ts,tsx}",
  "tests/**/*.{ts,tsx}",
];

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/coverage/**",
    "**/.vercel/**",
    "**/.codegraph/**",
    // 与 .gitignore 对齐：本地 acceptance 脚本不入库，也不应挡 pre-push / CI
    "tests/acceptance/**/run.mjs",
    "tests/acceptance/**/run-*.mjs",
    "tests/acceptance/**/smoke-*.mjs",
    "tests/acceptance/**/run*.py",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: tsFiles,
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // 现有代码基线：不因 lint 引入大规模逻辑改动
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
]);
