/**
 * yarn / yarn install 后把 core.hooksPath 指到仓库内 .githooks。
 * 非 git 工作树（部分 CI 场景）静默跳过。
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const prePush = join(root, ".githooks", "pre-push");

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    stdio: "ignore",
  });
} catch {
  process.exit(0);
}

if (!existsSync(prePush)) {
  process.exit(0);
}

try {
  chmodSync(prePush, 0o755);
} catch {
  // Windows 等可能无 chmod；hook 仍可由 bash 执行
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: root,
    stdio: "ignore",
  });
} catch {
  process.exit(0);
}
