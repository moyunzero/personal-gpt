import { describe, expect, it } from "vitest";

import { checkResOk } from "./check-res-ok";

describe("checkResOk", () => {
  it("accepts 2xx with ok true", () => {
    expect(checkResOk({ ok: true, status: 200 })).toBe(true);
    expect(checkResOk({ ok: true, status: 204 })).toBe(true);
  });

  it("rejects non-ok or non-2xx", () => {
    expect(checkResOk({ ok: false, status: 500 })).toBe(false);
    expect(checkResOk({ ok: true, status: 302 })).toBe(false);
  });
});
