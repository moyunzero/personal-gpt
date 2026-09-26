import { describe, expect, it } from "vitest";

import type { Citation } from "../types/kb";
import {
  filterCitationsBySourceMarkers,
  SourceMarkerStripper,
  stripSourceMarkers,
} from "./used-citations";

const citations: Citation[] = [
  { documentId: "doc-1", title: "第一条", similarity: 0.9, snippet: "甲" },
  { documentId: "doc-2", title: "第二条", similarity: 0.8, snippet: "乙" },
];

describe("filterCitationsBySourceMarkers", () => {
  it("keeps only the first citation when the answer contains [S1]", () => {
    const used = filterCitationsBySourceMarkers("根据资料 [S1] 作答。", citations);
    expect(used).toHaveLength(1);
    expect(used[0]?.documentId).toBe("doc-1");
  });

  it("returns an empty array when the answer has no [S digits] markers", () => {
    expect(filterCitationsBySourceMarkers("这是通识回答，没有编号。", citations)).toEqual([]);
  });

  it("treats [S10] as the tenth citation", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      documentId: `doc-${index + 1}`,
      title: `第${index + 1}条`,
      similarity: 0.7,
      snippet: "片段",
    }));
    const used = filterCitationsBySourceMarkers("见 [S10]。", many);
    expect(used.map((item) => item.documentId)).toEqual(["doc-10"]);
  });

  it("accepts fullwidth brackets and strips them from user-visible text", () => {
    const used = filterCitationsBySourceMarkers("幸福在心【S1】。自我准则【S2】。", citations);
    expect(used.map((item) => item.documentId)).toEqual(["doc-1", "doc-2"]);
    expect(stripSourceMarkers("幸福在心【S1】。准则 [S2]。")).toBe("幸福在心。准则。");
    const stripper = new SourceMarkerStripper();
    expect(stripper.feed("最终回答")).toBe("最终回答");
    expect(stripper.feed("只采用第一条 [S1]").length).toBeGreaterThan(0);
  });
  it("drops out-of-range markers and keeps array order for duplicates", () => {
    const used = filterCitationsBySourceMarkers("先 [S2] 再 [S1] 又 [S2]，外加 [S9]。", citations);
    expect(used.map((item) => item.documentId)).toEqual(["doc-1", "doc-2"]);
  });

  it("matches sourceNumber when it is not the array index", () => {
    const gapped: Citation[] = [
      { documentId: "doc-a", title: "A", similarity: 0.9, snippet: "甲", sourceNumber: 1 },
      { documentId: "doc-c", title: "C", similarity: 0.8, snippet: "丙", sourceNumber: 3 },
    ];
    const used = filterCitationsBySourceMarkers("见 [S3]，忽略未插入的 [S2]。", gapped);
    expect(used.map((item) => item.documentId)).toEqual(["doc-c"]);
  });
});
