import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: () => authMock(),
}));

import { assertKbAuth } from "./auth";

describe("assertKbAuth", () => {
  const prev = process.env.KB_ADMIN_TOKEN;

  afterEach(() => {
    authMock.mockReset();
    if (prev === undefined) delete process.env.KB_ADMIN_TOKEN;
    else process.env.KB_ADMIN_TOKEN = prev;
  });

  it("allows session users without admin token", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    const res = await assertKbAuth(new Request("http://localhost/api/kb"));
    expect(res).toBeNull();
  });

  it("accepts matching Bearer admin token with constant-time compare", async () => {
    authMock.mockResolvedValue(null);
    process.env.KB_ADMIN_TOKEN = "admin-secret";
    const res = await assertKbAuth(
      new Request("http://localhost/api/kb", {
        headers: { authorization: "Bearer admin-secret" },
      }),
    );
    expect(res).toBeNull();
  });

  it("rejects wrong admin token", async () => {
    authMock.mockResolvedValue(null);
    process.env.KB_ADMIN_TOKEN = "admin-secret";
    const res = await assertKbAuth(
      new Request("http://localhost/api/kb", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res?.status).toBe(401);
  });
});
