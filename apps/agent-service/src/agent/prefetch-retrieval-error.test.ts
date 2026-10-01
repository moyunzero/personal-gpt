import { describe, expect, it } from "vitest";

import { RETRIEVAL_UNAVAILABLE_HINT } from "./agent-synthesis";
import { pushRetrievalErrorIfFailed } from "./prefetch-retrieval-error";
import type { RaceExternalResult } from "./race-external-call";

describe("pushRetrievalErrorIfFailed", () => {
  it("pushes retrieval unavailable hint when race fails", () => {
    const seeds: Parameters<typeof pushRetrievalErrorIfFailed>[0] = [];
    const race: RaceExternalResult<string> = { ok: false, reason: "timeout" };
    expect(pushRetrievalErrorIfFailed(seeds, race)).toBe(true);
    expect(seeds).toHaveLength(1);
    expect(String(seeds[0]!.content)).toContain(RETRIEVAL_UNAVAILABLE_HINT);
  });

  it("does not push when race succeeds", () => {
    const seeds: Parameters<typeof pushRetrievalErrorIfFailed>[0] = [];
    const race: RaceExternalResult<string> = { ok: true, value: "hit" };
    expect(pushRetrievalErrorIfFailed(seeds, race)).toBe(false);
    expect(seeds).toHaveLength(0);
  });
});
