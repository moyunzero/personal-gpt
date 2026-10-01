import { describe, expect, it } from "vitest";

import { isDuplicateChatTurn } from "./persist-dedupe";

describe("isDuplicateChatTurn", () => {
  it("detects identical last user+assistant pair", () => {
    expect(
      isDuplicateChatTurn(
        [
          { role: "assistant", content: "a" },
          { role: "user", content: "q" },
        ],
        "q",
        "a",
      ),
    ).toBe(true);
  });

  it("allows new assistant content", () => {
    expect(
      isDuplicateChatTurn(
        [
          { role: "assistant", content: "old" },
          { role: "user", content: "q" },
        ],
        "q",
        "new",
      ),
    ).toBe(false);
  });

  it("treats empty assistant as skip", () => {
    expect(isDuplicateChatTurn([], "q", "  ")).toBe(true);
  });
});
