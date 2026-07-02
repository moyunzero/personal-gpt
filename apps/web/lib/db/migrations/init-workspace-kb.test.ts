import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(__dirname, "1730000000000-InitWorkspaceKb.ts");

describe("InitWorkspaceKb migration", () => {
  const source = readFileSync(migrationPath, "utf-8");

  it("defines workspaces, documents, and ingest_jobs tables", () => {
    expect(source).toMatch(/workspaces/i);
    expect(source).toMatch(/documents/i);
    expect(source).toMatch(/ingest_jobs/i);
  });

  it("requires documents.workspace_id NOT NULL", () => {
    expect(source).toMatch(/workspace_id[\s\S]*NOT NULL/i);
  });

  it("seeds default workspace slug", () => {
    expect(source).toMatch(/slug[\s\S]*default/i);
  });

  it("implements reversible down", () => {
    expect(source).toMatch(/async down\s*\(/);
    expect(source).toMatch(/DROP TABLE/i);
  });
});
