import * as fs from "node:fs";
import path from "node:path";

let cachedMonorepoRoot: string | undefined;

/**
 * 解析 monorepo 根目录。Turbopack 下 `__dirname` 可能是虚拟 `/ROOT`，
 * 不能靠相对路径拼 uploads；向上查找带 workspaces 的 package.json。
 */
export function getMonorepoRoot(): string {
  if (cachedMonorepoRoot) return cachedMonorepoRoot;

  const fromEnv = process.env.MONOREPO_ROOT?.trim();
  if (fromEnv) {
    cachedMonorepoRoot = path.resolve(fromEnv);
    return cachedMonorepoRoot;
  }

  let current = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
          workspaces?: unknown;
        };
        if (pkg.workspaces) {
          cachedMonorepoRoot = current;
          return current;
        }
      } catch {
        // ignore malformed package.json
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  cachedMonorepoRoot = path.resolve(process.cwd(), "../..");
  return cachedMonorepoRoot;
}

/** web 与 ingest-worker 共用的本地上传目录 */
export function getUploadsDir(): string {
  return path.join(getMonorepoRoot(), "uploads");
}
