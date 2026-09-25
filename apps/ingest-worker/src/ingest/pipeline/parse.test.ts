import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getUploadsDir } from "../../../../../packages/shared/src/utils/paths";

const pdfMocks = vi.hoisted(() => ({
  getText: vi.fn(),
  getInfo: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    getText = pdfMocks.getText;
    getInfo = pdfMocks.getInfo;
    destroy = pdfMocks.destroy;
  },
}));

import { assertPdfHasBody, parsePdfPages, PDF_NO_SELECTABLE_TEXT, pdfBodyText } from "./parse";

const SAMPLE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../test/fixtures/sample.pdf",
);

afterEach(() => {
  pdfMocks.getText.mockReset();
  pdfMocks.getInfo.mockReset();
  pdfMocks.destroy.mockReset();
});

describe("assertPdfHasBody", () => {
  it("rejects page-marker lines and blank pages", () => {
    expect(() => assertPdfHasBody([{ text: "-- 1 of 10 --" }])).toThrow(PDF_NO_SELECTABLE_TEXT);
    expect(() => assertPdfHasBody([])).toThrow(PDF_NO_SELECTABLE_TEXT);
    expect(() => assertPdfHasBody([{ text: "  \n" }])).toThrow(PDF_NO_SELECTABLE_TEXT);
    try {
      assertPdfHasBody([{ text: "-- 1 of 10 --" }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).not.toMatch(/\/|uploads|filePath|Parsed empty text/);
    }
  });

  it("accepts a short sentence beside a marker", () => {
    expect(() => assertPdfHasBody([{ text: "-- 1 of 2 --\n你好。" }])).not.toThrow();
    expect(pdfBodyText([{ text: "-- 1 of 2 --\n你好。" }])).toBe("你好。");
  });
});

describe("parsePdfPages", () => {
  async function withSamplePdf(
    run: (filePath: string) => Promise<void>,
  ): Promise<void> {
    const dest = path.join(getUploadsDir(), "parse-pdf-pages-sample.pdf");
    await fs.mkdir(getUploadsDir(), { recursive: true });
    await fs.copyFile(SAMPLE_PDF, dest);
    try {
      await run(dest);
    } finally {
      await fs.unlink(dest).catch(() => undefined);
    }
  }

  it("asks getText for an empty page joiner and returns trimmed pages", async () => {
    pdfMocks.getText.mockResolvedValue({
      pages: [
        { num: 1, text: "  你好。  " },
        { num: 3, text: "  世界  " },
      ],
    });
    pdfMocks.getInfo.mockResolvedValue({ outline: undefined });
    pdfMocks.destroy.mockResolvedValue(undefined);

    await withSamplePdf(async (filePath) => {
      const parsed = await parsePdfPages(filePath);
      expect(pdfMocks.getText).toHaveBeenCalledWith({ pageJoiner: "" });
      expect(parsed.pages).toEqual([
        { num: 1, text: "你好。" },
        { num: 3, text: "世界" },
      ]);
      expect(parsed.headings).toEqual([]);
      expect(pdfMocks.destroy).toHaveBeenCalled();
    });
  });

  it("collects outline titles including nested items", async () => {
    pdfMocks.getText.mockResolvedValue({
      pages: [{ num: 1, text: "你好。" }],
    });
    pdfMocks.getInfo.mockResolvedValue({
      outline: [{ title: "  第二章 ", items: [{ title: "附录" }, { title: "   " }] }],
    });
    pdfMocks.destroy.mockResolvedValue(undefined);

    await withSamplePdf(async (filePath) => {
      const parsed = await parsePdfPages(filePath);
      expect(parsed.headings).toEqual(["第二章", "附录"]);
    });
  });
});
