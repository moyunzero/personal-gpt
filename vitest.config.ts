import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web"),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "apps/agent-service/**/*.test.ts",
      "apps/web/**/*.test.ts",
      "packages/**/*.test.ts",
    ],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["tests/setup-env.ts"],
  },
});
