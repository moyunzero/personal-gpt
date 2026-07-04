/**
 * Loader checkpoint：在 worker 内试跑 parseDocument（pdf-parse@2 + mammoth + 直读）。
 * 用法：yarn workspace ingest-worker verify:parse
 */
import * as path from "node:path";

import { parseDocumentUnsafe } from "../src/ingest/pipeline/parse";

const FIXTURES = path.join(__dirname, "../test/fixtures");

async function main() {
  const cases = [
    {
      file: "sample.pdf",
      mime: "application/pdf",
      expect: "Hello PDF fixture",
    },
    {
      file: "sample.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      expect: "Hello DOCX fixture",
    },
    {
      file: "sample.txt",
      mime: "text/plain",
      expect: "plain text fixture",
    },
    {
      file: "sample.md",
      mime: "text/markdown",
      expect: "Markdown Fixture",
    },
  ] as const;

  for (const { file, mime, expect } of cases) {
    const filePath = path.join(FIXTURES, file);
    const text = await parseDocumentUnsafe(filePath, mime);
    if (!text.includes(expect)) {
      throw new Error(`${file}: expected "${expect}" in parsed text, got: ${text.slice(0, 120)}`);
    }
    console.log(`OK ${file} (${mime}): ${text.length} chars`);
  }

  console.log("Loader strategy verified: pdf-parse@2 + mammoth + plain text read");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
