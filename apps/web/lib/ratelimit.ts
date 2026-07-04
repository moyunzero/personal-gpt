import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { env } from "./env";
import { logger } from "./logger";

const WINDOW = "60 s" as const;

const CHAT_LIMIT = 10;
const KB_LIMIT = 30;

/**
 * 构造限流器单例。任一 cred 缺失 → 返回 null（fail-open 入口）。
 */
export function buildLimiter(
  url: string | undefined,
  token: string | undefined,
  prefix: string,
  limit: number,
): Ratelimit | null {
  if (!url || !token) return null;
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, WINDOW),
    analytics: false,
    prefix,
  });
}

const chatLimiter = buildLimiter(
  env.UPSTASH_REDIS_REST_URL,
  env.UPSTASH_REDIS_REST_TOKEN,
  "ratelimit:chat",
  CHAT_LIMIT,
);

const kbLimiter = buildLimiter(
  env.UPSTASH_REDIS_REST_URL,
  env.UPSTASH_REDIS_REST_TOKEN,
  "ratelimit:kb",
  KB_LIMIT,
);

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** 桶下次重置的 epoch ms（未来时间点） */
  reset: number;
  /** 客户端可读的 Retry-After 秒数；success=true 时为 0 */
  retryAfterSeconds: number;
}

function passThrough(limit: number): RateLimitResult {
  return {
    success: true,
    limit,
    remaining: limit,
    reset: 0,
    retryAfterSeconds: 0,
  };
}

async function checkWithLimiter(
  limiter: Ratelimit | null,
  identifier: string,
  requestId: string,
  scope: string,
  defaultLimit: number,
): Promise<RateLimitResult> {
  const log = logger.child({ scope, requestId });

  if (!limiter) {
    log.debug("ratelimit disabled (UPSTASH env not set)");
    return passThrough(defaultLimit);
  }

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    const retryAfterSeconds = success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000));

    if (success) {
      log.metric("ratelimit.allowed", { identifier, remaining });
    } else {
      log.metric("ratelimit.blocked", { identifier, remaining, retryAfterSeconds });
    }

    return { success, limit, remaining, reset, retryAfterSeconds };
  } catch (err) {
    log.error("ratelimit check failed (fail-open)", { err });
    return passThrough(defaultLimit);
  }
}

/** /api/chat 限流：10 req / 60s */
export async function checkRateLimit(
  identifier: string,
  requestId: string,
): Promise<RateLimitResult> {
  return checkWithLimiter(chatLimiter, identifier, requestId, "ratelimit", CHAT_LIMIT);
}

/** /api/kb/* 限流：30 req / 60s */
export async function checkKbRateLimit(
  identifier: string,
  requestId: string,
): Promise<RateLimitResult> {
  return checkWithLimiter(kbLimiter, identifier, requestId, "ratelimit.kb", KB_LIMIT);
}

export function rateLimitJsonResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      retryAfter: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.reset),
      },
    },
  );
}

/**
 * 从 Request 提取客户端 IP。Vercel 在边缘把客户端真实 IP 写到 x-forwarded-for 首项。
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "local";
}
