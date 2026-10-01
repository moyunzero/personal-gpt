import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(__dirname, "1744300000000-KbQueryIndexes.ts");

describe("KbQueryIndexes migration", () => {
  const source = readFileSync(migrationPath, "utf-8");

  it("indexes documents(workspace_id, status, created_at)", () => {
    expect(source).toMatch(/documents[\s\S]*workspace_id[\s\S]*status[\s\S]*created_at/i);
  });

  it("indexes ingest_jobs(document_id)", () => {
    expect(source).toMatch(/ingest_jobs[\s\S]*document_id/i);
  });

  it("indexes chat_messages(session_id)", () => {
    expect(source).toMatch(/chat_messages[\s\S]*session_id/i);
  });

  it("implements reversible down", () => {
    expect(source).toMatch(/async down\s*\(/);
    expect(source).toMatch(/DROP INDEX/i);
  });
});
