/**
 * Citation alignment gate.
 * Schema follows RAGAS SingleTurnSample fields (user_input, response, reference)
 * plus explicit hit lists and expected document titles.
 * This run scores the shipped citation contract. It does not call a live LLM judge.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { filterCitationsBySourceMarkers, stripSourceMarkers } from "@personal-gpt/shared";
import type { Citation } from "@personal-gpt/shared/types/kb";

import { groupCitationsByDocument } from "../../../apps/web/app/components/group-citations";

const THRESHOLD = 0.55;

type Hit = {
  documentId: string;
  title: string;
  similarity: number;
  snippet: string;
  chunkIndex?: number;
};

type GoldenCase = {
  id: string;
  stratum: string;
  user_input: string;
  reference: string;
  response: string;
  expectTitles: string[];
  expectCardCount?: number;
  forbidTitles: string[];
  hits: Hit[];
};

type CaseScore = {
  id: string;
  stratum: string;
  precision: number;
  recall: number;
  forbidden: boolean;
  leaked: boolean;
  cardCountOk: boolean;
  pass: boolean;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(__dirname, "golden.json"), "utf8")) as GoldenCase[];

function scoreCase(item: GoldenCase): CaseScore {
  const eligible = item.hits.filter((hit) => hit.similarity >= THRESHOLD);
  const citations: Citation[] = eligible.map((hit, index) => ({
    documentId: hit.documentId,
    title: hit.title,
    similarity: hit.similarity,
    snippet: hit.snippet,
    chunkIndex: hit.chunkIndex ?? index,
  }));
  const used = filterCitationsBySourceMarkers(item.response, citations);
  const shown = groupCitationsByDocument(used).map((group) => group.title);
  const visible = stripSourceMarkers(item.response);
  const leaked = /(?:\[|【|［)S\d+/.test(visible);
  const shownSet = new Set(shown);
  const expectSet = new Set(item.expectTitles);
  const overlap = item.expectTitles.filter((title) => shownSet.has(title)).length;
  const precision =
    shown.length === 0 ? (item.expectTitles.length === 0 ? 1 : 0) : overlap / shownSet.size;
  const recall =
    item.expectTitles.length === 0 ? (shown.length === 0 ? 1 : 0) : overlap / expectSet.size;
  const forbidden = item.forbidTitles.some((title) => shownSet.has(title));
  const cardCountOk =
    item.expectCardCount === undefined ||
    groupCitationsByDocument(used).length === item.expectCardCount;
  const pass = precision === 1 && recall === 1 && !forbidden && !leaked && cardCountOk;
  return {
    id: item.id,
    stratum: item.stratum,
    precision,
    recall,
    forbidden,
    leaked,
    cardCountOk,
    pass,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe("citation alignment golden set", () => {
  const scores = golden.map(scoreCase);

  it("covers the citation contract across strata and writes the analysis", () => {
    expect(golden.length).toBeGreaterThanOrEqual(20);
    const strata = new Set(golden.map((item) => item.stratum));
    expect(strata.size).toBeGreaterThanOrEqual(8);

    const citationPrecision = mean(scores.map((row) => row.precision));
    const citationRecall = mean(scores.map((row) => row.recall));
    const forbiddenRate = scores.filter((row) => row.forbidden).length / scores.length;
    const leakRate = scores.filter((row) => row.leaked).length / scores.length;
    const passRate = scores.filter((row) => row.pass).length / scores.length;

    const failed = scores.filter((row) => !row.pass).map((row) => row.id);
    const stratumRows = [...strata].map((stratum) => {
      const rows = scores.filter((row) => row.stratum === stratum);
      return {
        stratum,
        n: rows.length,
        precision: mean(rows.map((row) => row.precision)),
        recall: mean(rows.map((row) => row.recall)),
        passed: rows.filter((row) => row.pass).length,
      };
    });

    writeFileSync(
      join(__dirname, "results.json"),
      JSON.stringify(
        {
          date: "2026-09-25",
          n: scores.length,
          strata: strata.size,
          citationPrecision,
          citationRecall,
          forbiddenRate,
          leakRate,
          passRate,
          failed,
          byStratum: stratumRows,
        },
        null,
        2,
      ),
    );
    expect(failed).toEqual([]);
    expect(forbiddenRate).toBe(0);
    expect(leakRate).toBe(0);
    expect(passRate).toBe(1);
  });
});
