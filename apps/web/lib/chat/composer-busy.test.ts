import { describe, expect, it } from "vitest";

import { composerIsStop, isChatBusy } from "./composer-busy";

describe("isChatBusy / composerIsStop (FIX-S1-02 / D-05)", () => {
  it("treats submitted as busy/stop", () => {
    expect(isChatBusy("submitted")).toBe(true);
    expect(composerIsStop("submitted")).toBe(true);
  });

  it("treats streaming as busy/stop", () => {
    expect(isChatBusy("streaming")).toBe(true);
    expect(composerIsStop("streaming")).toBe(true);
  });

  it("treats ready as idle/submit", () => {
    expect(isChatBusy("ready")).toBe(false);
    expect(composerIsStop("ready")).toBe(false);
  });

  it("treats error as idle/submit", () => {
    expect(isChatBusy("error")).toBe(false);
    expect(composerIsStop("error")).toBe(false);
  });
});
