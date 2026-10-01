import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = join(__dirname, "run-kb-migrations.mjs");

describe("run-kb-migrations.mjs", () => {
  const source = readFileSync(scriptPath, "utf-8");

  it("runs TypeORM migration:run instead of hand-SQL InitWorkspaceKb-only bootstrap", () => {
    expect(source).toMatch(/migration:run/);
    expect(source).toMatch(/typeorm/);
    expect(source).not.toMatch(/CREATE TABLE "documents"/);
    expect(source).not.toMatch(/InitWorkspaceKb1730000000000/);
  });

  it("skips in non-Vercel CI", () => {
    expect(source).toMatch(/CI.*VERCEL/);
  });
});
