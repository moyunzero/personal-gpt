import { describe, expect, it } from "vitest";

import type { Citation } from "../types/kb";
import { filterCitationsBySourceMarkers } from "./used-citations";

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

  it("drops out-of-range markers and keeps array order for duplicates", () => {
    const used = filterCitationsBySourceMarkers("先 [S2] 再 [S1] 又 [S2]，外加 [S9]。", citations);
    expect(used.map((item) => item.documentId)).toEqual(["doc-1", "doc-2"]);
  });
});
