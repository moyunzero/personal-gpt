import { afterEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";

import { AgentController } from "./agent.controller";
import { bearerMatchesInternalToken } from "./internal-token";

describe("bearerMatchesInternalToken", () => {
  it("accepts matching Bearer token", () => {
    expect(bearerMatchesInternalToken("Bearer secret-token", "secret-token")).toBe(true);
    expect(bearerMatchesInternalToken("bearer secret-token", "secret-token")).toBe(true);
  });

  it("rejects missing, wrong, or unequal-length tokens", () => {
    expect(bearerMatchesInternalToken(undefined, "secret-token")).toBe(false);
    expect(bearerMatchesInternalToken("Bearer", "secret-token")).toBe(false);
    expect(bearerMatchesInternalToken("Bearer wrong-token", "secret-token")).toBe(false);
    expect(bearerMatchesInternalToken("Bearer short", "secret-token")).toBe(false);
  });
});

describe("AgentController token gate", () => {
  const prev = process.env.AGENT_INTERNAL_TOKEN;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prev === undefined) delete process.env.AGENT_INTERNAL_TOKEN;
    else process.env.AGENT_INTERNAL_TOKEN = prev;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it("throws UnauthorizedException when token mismatches", async () => {
    process.env.AGENT_INTERNAL_TOKEN = "expected-secret";
    const streamChat = vi.fn();
    const controller = new AgentController({ streamChat } as never);
    await expect(controller.chat({}, "Bearer wrong-secret", {} as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(streamChat).not.toHaveBeenCalled();
  });

  it("calls streamChat when token matches", async () => {
    process.env.AGENT_INTERNAL_TOKEN = "expected-secret";
    const streamChat = vi.fn().mockResolvedValue(undefined);
    const controller = new AgentController({ streamChat } as never);
    const res = {} as never;
    await controller.chat({ messages: [] }, "Bearer expected-secret", res);
    expect(streamChat).toHaveBeenCalledOnce();
  });

  it("fail-closed in production when AGENT_INTERNAL_TOKEN is missing", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.AGENT_INTERNAL_TOKEN;
    const streamChat = vi.fn();
    const controller = new AgentController({ streamChat } as never);
    await expect(
      controller.chat({ messages: [] }, "Bearer anything", {} as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(streamChat).not.toHaveBeenCalled();
  });
});
