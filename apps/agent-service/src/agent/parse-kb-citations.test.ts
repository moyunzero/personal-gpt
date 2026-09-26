/**
 * parseKbCitationsFromToolText 读回可选 page。不启动模型。
 */
import { describe, expect, it } from "vitest";

import { parseKbCitationsFromToolText } from "./agent.service";

const hitWithoutPage = `[S1]
title: 差旅政策
source: policy.pdf
documentId: doc-1
chunkIndex: 2
similarity: 0.910
workspaceId: ws-1
snippet: 第三页条款`;

describe("parseKbCitationsFromToolText page", () => {
  it("sets citation.page when the tool block has a finite page line", () => {
    const text = hitWithoutPage.replace("chunkIndex: 2\n", "chunkIndex: 2\npage: 7\n");
    const citations = parseKbCitationsFromToolText(text);
    expect(citations).toHaveLength(1);
    expect(citations[0]?.page).toBe(7);
    expect(citations[0]?.documentId).toBe("doc-1");
    expect(citations[0]?.chunkIndex).toBe(2);
  });

  it("omits the page key when the tool block has no page line", () => {
    const citations = parseKbCitationsFromToolText(hitWithoutPage);
    expect(citations).toHaveLength(1);
    expect(citations[0]).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(citations[0], "page")).toBe(false);
  });
});
