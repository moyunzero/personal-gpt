import { describe, expect, it } from "vitest";

import { raceExternalCall } from "./race-external-call";

describe("raceExternalCall", () => {
  it("returns undefined when the wrapped promise rejects", async () => {
    await expect(
      raceExternalCall(Promise.reject(new Error("boom")), { timeoutMs: 50 }),
    ).resolves.toBeUndefined();
  });

  it("returns the resolved value when the promise succeeds", async () => {
    await expect(raceExternalCall(Promise.resolve("ok"), { timeoutMs: 50 })).resolves.toBe("ok");
  });
});
