/**
 * Vercel / local build: run real TypeORM migrations (not a partial hand-SQL bootstrap).
 * Skips in GitHub Actions CI without Vercel (no Postgres). Docker runtime uses compose migrate.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

function main() {
  if (process.env.CI && !process.env.VERCEL) {
    console.log("[migrate] CI（非 Vercel）跳过 TypeORM migration:run");
    return;
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url || url === "[SENSITIVE]" || !url.startsWith("postgres")) {
    console.log("[migrate] DATABASE_URL 不可用，跳过 migration:run");
    return;
  }

  console.log("[migrate] running TypeORM migration:run …");
  const result = spawnSync(
    "yarn",
    ["typeorm-ts-node-commonjs", "migration:run", "-d", "lib/db/data-source.ts"],
    {
      cwd: webRoot,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  console.log("[migrate] TypeORM migrations applied");
}

main();
