import Redis from "ioredis";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis as UpstashRedis } from "@upstash/redis";

import { env } from "./env";
import { logger } from "./logger";
import { rateLimitExceededTotal } from "./metrics";

const WINDOW_SEC = 60;
const WINDOW = "60 s" as const;

const CHAT_LIMIT = 10;
const KB_LIMIT = 30;
/** 游客试用：每 IP 每小时 5 次（对齐 ChatGPT 限次试用） */
const GUEST_CHAT_LIMIT = 5;
const GUEST_WINDOW = "1 h" as const;

let ioredisClient: Redis | null | undefined;

function getIoRedis(): Redis | null {
  if (ioredisClient !== undefined) return ioredisClient;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    ioredisClient = null;
    return null;
  }
  try {
    ioredisClient = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  } catch {
    ioredisClient = null;
  }
  return ioredisClient;
}

/**
 * 构造限流器单例。任一 cred 缺失 → 返回 null（fail-open 入口）。
 */
export function buildLimiter(
  url: string | undefined,
  token: string | undefined,
  prefix: string,
  limit: number,
  window: `${number} ${"s" | "m" | "h" | "d"}` = WINDOW,
): Ratelimit | null {
  if (!url || !token) return null;
  return new Ratelimit({
    redis: new UpstashRedis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, window),
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

const guestChatLimiter = buildLimiter(
  env.UPSTASH_REDIS_REST_URL,
  env.UPSTASH_REDIS_REST_TOKEN,
  "ratelimit:guest-chat",
  GUEST_CHAT_LIMIT,
  GUEST_WINDOW,
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

async function checkWithIoRedis(
  userId: string,
  scope: "chat" | "kb",
  defaultLimit: number,
): Promise<RateLimitResult | null> {
  const client = getIoRedis();
  if (!client) return null;

  const key = `ratelimit:${scope}:${userId}`;
  try {
    if (client.status === "wait") {
      await client.connect();
    }
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, WINDOW_SEC);
    }
    const ttl = await client.ttl(key);
    const resetMs = Date.now() + Math.max(ttl, 1) * 1000;
    const success = count <= defaultLimit;
    const remaining = success ? Math.max(0, defaultLimit - count) : 0;
    const retryAfterSeconds = success ? 0 : Math.max(1, ttl > 0 ? ttl : WINDOW_SEC);
    return {
      success,
      limit: defaultLimit,
      remaining,
      reset: resetMs,
      retryAfterSeconds,
    };
  } catch {
    return null;
  }
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
      rateLimitExceededTotal.inc({ scope: scope.replace("ratelimit.", "") });
    }

    return { success, limit, remaining, reset, retryAfterSeconds };
  } catch (err) {
    log.error("ratelimit check failed (fail-open)", { err });
    return passThrough(defaultLimit);
  }
}

/** D-35: primary path — Redis INCR+EXPIRE keyed by userId when REDIS_URL set */
export async function checkUserRateLimit(
  userId: string,
  requestId: string,
  scope: "chat" | "kb" = "chat",
): Promise<RateLimitResult> {
  const defaultLimit = scope === "chat" ? CHAT_LIMIT : KB_LIMIT;
  const log = logger.child({ scope: `ratelimit.${scope}`, requestId });

  const redisResult = await checkWithIoRedis(userId, scope, defaultLimit);
  if (redisResult) {
    if (redisResult.success) {
      log.metric("ratelimit.allowed", { identifier: userId, remaining: redisResult.remaining });
    } else {
      rateLimitExceededTotal.inc({ scope });
      log.metric("ratelimit.blocked", {
        identifier: userId,
        remaining: redisResult.remaining,
        retryAfterSeconds: redisResult.retryAfterSeconds,
      });
    }
    return redisResult;
  }

  const limiter = scope === "chat" ? chatLimiter : kbLimiter;
  return checkWithLimiter(limiter, userId, requestId, `ratelimit.${scope}`, defaultLimit);
}

/** /api/chat 限流：10 req / 60s — prefers userId when authed (D-35) */
export async function checkRateLimit(
  identifier: string,
  requestId: string,
): Promise<RateLimitResult> {
  return checkUserRateLimit(identifier, requestId, "chat");
}

/** /api/kb/* 限流：30 req / 60s */
export async function checkKbRateLimit(
  identifier: string,
  requestId: string,
): Promise<RateLimitResult> {
  return checkUserRateLimit(identifier, requestId, "kb");
}

/** 游客试用聊天：5 req / 1h，按 IP（或传入的 guest key） */
export async function checkGuestChatRateLimit(
  identifier: string,
  requestId: string,
): Promise<RateLimitResult> {
  const log = logger.child({ scope: "ratelimit.guest-chat", requestId });
  if (!guestChatLimiter) {
    // Upstash 未配时退回通用 chat 桶，仍 fail-open/限流逻辑一致
    return checkUserRateLimit(`guest:${identifier}`, requestId, "chat");
  }
  return checkWithLimiter(
    guestChatLimiter,
    identifier,
    requestId,
    "ratelimit.guest-chat",
    GUEST_CHAT_LIMIT,
  );
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

/** Test helper: reset lazy ioredis singleton */
export function resetRateLimitRedisForTests(): void {
  if (ioredisClient) {
    void ioredisClient.quit().catch(() => {});
  }
  ioredisClient = undefined;
}
