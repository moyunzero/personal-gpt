import { describe, expect, it } from "vitest";

import { normalizeUploadMime } from "./ingest";
import { getMonorepoRoot, getUploadsDir } from "./paths";

describe("getMonorepoRoot", () => {
  it("finds workspace root from cwd", () => {
    const root = getMonorepoRoot();
    expect(root).toMatch(/personal-gpt$/);
    expect(getUploadsDir()).toBe(`${root}/uploads`);
  });
});

describe("normalizeUploadMime", () => {
  it("maps octet-stream to markdown by .md extension", () => {
    expect(normalizeUploadMime("notes.md", "application/octet-stream")).toBe(
      "text/markdown",
    );
  });

  it("keeps explicit allowed mime", () => {
    expect(normalizeUploadMime("a.pdf", "application/pdf")).toBe(
      "application/pdf",
    );
  });
});
