import { describe, expect, it, vi } from "vitest";

// 让 lib/env.ts 在被 ratelimit.ts import 时通过 Zod 校验。
// 这里 stub 的值不会被 ratelimit 实际使用（只走 buildLimiter 这条纯函数路径）。
// vi.hoisted 保证这段代码在所有 import 之前执行。
vi.hoisted(() => {
  process.env.ASTRA_DB_COLLECTION = "test_collection";
  process.env.ASTRA_DB_API_ENDPOINT = "https://test.example.com";
  process.env.ASTRA_DB_APPLICATION_TOKEN = "AstraCS:test";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test_key";
  process.env.GROQ_API_KEY = "test_groq_key";
  process.env.NIM_API_KEY = "test_nim_key";
  // 故意不设 UPSTASH_*，让模块顶层的 limiter 落到 null 分支
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

import {
  buildLimiter,
  checkUserRateLimit,
  GUEST_CHAT_WINDOW_SEC,
  getClientIp,
  guestRateLimitShouldFailClosed,
  guestRateLimitUnavailable,
  rateLimitJsonResponse,
} from "./ratelimit";

describe("buildLimiter (fail-open 入口)", () => {
  it("url 缺失 → 返回 null", () => {
    expect(buildLimiter(undefined, "tok", "ratelimit:test", 10)).toBeNull();
    expect(buildLimiter("", "tok", "ratelimit:test", 10)).toBeNull();
  });

  it("token 缺失 → 返回 null", () => {
    expect(buildLimiter("https://x.upstash.io", undefined, "ratelimit:test", 10)).toBeNull();
    expect(buildLimiter("https://x.upstash.io", "", "ratelimit:test", 10)).toBeNull();
  });

  it("两者都缺 → 返回 null", () => {
    expect(buildLimiter(undefined, undefined, "ratelimit:test", 10)).toBeNull();
  });

  it("两者都给 → 返回 Ratelimit 实例（不实际打 Redis）", () => {
    const limiter = buildLimiter("https://x.upstash.io", "tok", "ratelimit:test", 10);
    expect(limiter).not.toBeNull();
    expect(typeof limiter?.limit).toBe("function");
  });
});

describe("getClientIp", () => {
  function makeReq(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/chat", { headers });
  }

  it("ignores XFF when proxy headers are untrusted", () => {
    const prevTrust = process.env.TRUST_PROXY;
    const prevVercel = process.env.VERCEL;
    delete process.env.TRUST_PROXY;
    delete process.env.VERCEL;
    try {
      expect(getClientIp(makeReq({ "x-forwarded-for": "203.0.113.7" }))).toBe("local");
    } finally {
      if (prevTrust === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prevTrust;
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
    }
  });

  it("优先取 x-forwarded-for 首项 when TRUST_PROXY=1", () => {
    const prev = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = "1";
    try {
      const ip = getClientIp(makeReq({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }));
      expect(ip).toBe("203.0.113.7");
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });

  it("x-forwarded-for 单值也支持", () => {
    const prev = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = "1";
    try {
      expect(getClientIp(makeReq({ "x-forwarded-for": "198.51.100.42" }))).toBe("198.51.100.42");
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });

  it("x-forwarded-for 缺失时 fallback 到 x-real-ip", () => {
    const prev = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = "1";
    try {
      expect(getClientIp(makeReq({ "x-real-ip": "192.0.2.5" }))).toBe("192.0.2.5");
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });

  it("两个 header 都没有 → 退化为 'local'", () => {
    const prev = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = "1";
    try {
      expect(getClientIp(makeReq({}))).toBe("local");
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });

  it("x-forwarded-for 空字符串 → fallback", () => {
    const prev = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = "1";
    try {
      expect(getClientIp(makeReq({ "x-real-ip": "192.0.2.9" }))).toBe("192.0.2.9");
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });

  it("自动 trim 多余空格", () => {
    const prev = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = "1";
    try {
      expect(getClientIp(makeReq({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7");
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });
});

describe("checkUserRateLimit 429 shape", () => {
  it("rateLimitJsonResponse exposes retryAfter", async () => {
    const res = rateLimitJsonResponse({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 5000,
      retryAfterSeconds: 5,
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { retryAfter: number };
    expect(body.retryAfter).toBe(5);
  });

  it("fail-open when no redis configured", async () => {
    delete process.env.REDIS_URL;
    const result = await checkUserRateLimit("user-1", "req-1");
    expect(result.success).toBe(true);
  });
});

describe("guestRateLimitUnavailable", () => {
  it("unavailable when no Upstash guest limiter and no REDIS_URL", () => {
    expect(guestRateLimitUnavailable({ hasGuestUpstashLimiter: false, hasRedisUrl: false })).toBe(
      true,
    );
  });

  it("available when Redis URL is set", () => {
    expect(guestRateLimitUnavailable({ hasGuestUpstashLimiter: false, hasRedisUrl: true })).toBe(
      false,
    );
  });

  it("available when Upstash guest limiter exists", () => {
    expect(guestRateLimitUnavailable({ hasGuestUpstashLimiter: true, hasRedisUrl: false })).toBe(
      false,
    );
  });
});

describe("guestRateLimitShouldFailClosed", () => {
  it("fail-closed in production when unavailable", () => {
    expect(guestRateLimitShouldFailClosed({ unavailable: true, nodeEnv: "production" })).toBe(true);
  });

  it("fail-open in development when unavailable", () => {
    expect(guestRateLimitShouldFailClosed({ unavailable: true, nodeEnv: "development" })).toBe(
      false,
    );
  });

  it("not fail-closed when limiter backend exists", () => {
    expect(guestRateLimitShouldFailClosed({ unavailable: false, nodeEnv: "production" })).toBe(
      false,
    );
  });
});

describe("checkGuestChatRateLimit ioredis window", () => {
  it("uses 3600s guest window (aligned with Upstash 1 h)", () => {
    expect(GUEST_CHAT_WINDOW_SEC).toBe(3600);
  });
});
