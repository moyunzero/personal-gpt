import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { env } from "./env";
import { logger } from "./logger";

/**
 * 限流参数。改这两个值即可调整阈值；阈值很少变动，不开 env 配置。
 * 滑动窗口：过去 60 秒内同一 identifier 最多 10 次请求。
 */
const LIMIT = 10;
const WINDOW = "60 s" as const;

/**
 * 构造限流器单例。任一 cred 缺失 → 返回 null（fail-open 入口）。
 * 抽成接收参数的函数是为了让单测能独立验证 null 分支，
 * 而不必通过 vi.stubEnv + resetModules 这类绕弯路径。
 */
export function buildLimiter(
  url: string | undefined,
  token: string | undefined,
): Ratelimit | null {
  if (!url || !token) return null;
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(LIMIT, WINDOW),
    // analytics 会额外发 Redis 命令；免费层 10k/day 省着花，关掉
    analytics: false,
    // 不同 endpoint 共享 Upstash 时用 prefix 区分桶
    prefix: "ratelimit:chat",
  });
}

/**
 * 模块级单例。Vercel cold start 时实例化一次；自托管长进程下保持一份。
 *
 * Fail-open 设计：若 env 任一未设置 → limiter 为 null → checkRateLimit 直接放行。
 * 这是有意为之：限流是降级特性，本地开发 / Marketplace 未配 / Upstash 临时挂了
 * 都不应卡用户。
 */
const limiter = buildLimiter(
  env.UPSTASH_REDIS_REST_URL,
  env.UPSTASH_REDIS_REST_TOKEN,
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

/** limiter 没配 / 出错 时使用的放行结果 */
function passThrough(): RateLimitResult {
  return {
    success: true,
    limit: LIMIT,
    remaining: LIMIT,
    reset: 0,
    retryAfterSeconds: 0,
  };
}

/**
 * 按 identifier（通常是 IP）检查限流。
 *
 * Fail-open 路径：
 *   - limiter null（env 缺）→ passThrough
 *   - limiter throw（Upstash 挂、网络抖动）→ log.error + passThrough
 *
 * 返回结构供调用方决定 429 还是放行，并构造 Retry-After / X-RateLimit-* 响应头。
 */
export async function checkRateLimit(
  identifier: string,
  requestId: string,
): Promise<RateLimitResult> {
  const log = logger.child({ scope: "ratelimit", requestId });

  if (!limiter) {
    log.debug("ratelimit disabled (UPSTASH env not set)");
    return passThrough();
  }

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    const retryAfterSeconds = success
      ? 0
      : Math.max(1, Math.ceil((reset - Date.now()) / 1000));

    if (success) {
      log.metric("ratelimit.allowed", { identifier, remaining });
    } else {
      log.metric("ratelimit.blocked", {
        identifier,
        remaining,
        retryAfterSeconds,
      });
    }

    return { success, limit, remaining, reset, retryAfterSeconds };
  } catch (err) {
    // Upstash 挂了不能让业务跟着挂；记错就放行。
    log.error("ratelimit check failed (fail-open)", { err });
    return passThrough();
  }
}

/**
 * 从 Request 提取客户端 IP。Vercel 在边缘把客户端真实 IP 写到 x-forwarded-for 首项。
 * 本地开发没有这两个头 → 退化为 "local"（同一桶；本地不指望细粒度限流）。
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // x-forwarded-for 形如 "client, proxy1, proxy2"，取最左
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "local";
}
