import { describe, expect, it } from "vitest";

import { raceExternalCall } from "./race-external-call";

describe("raceExternalCall", () => {
  it("returns ok:false reason error when the wrapped promise rejects", async () => {
    await expect(
      raceExternalCall(Promise.reject(new Error("boom")), { timeoutMs: 50 }),
    ).resolves.toEqual({ ok: false, reason: "error" });
  });

  it("returns ok:true value when the promise succeeds", async () => {
    await expect(raceExternalCall(Promise.resolve("ok"), { timeoutMs: 50 })).resolves.toEqual({
      ok: true,
      value: "ok",
    });
  });

  it("returns ok:false reason timeout when promise hangs", async () => {
    await expect(
      raceExternalCall(new Promise<string>(() => {}), { timeoutMs: 20 }),
    ).resolves.toEqual({ ok: false, reason: "timeout" });
  });
});
