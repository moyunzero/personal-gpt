/**
 * Redis 短期记忆：最近 N 轮原文 + 滚动摘要（MEM-01 / D-17 / D-18）。
 * 键：`${prefix}:${workspaceId}:${userKey}`；Redis 不可用时 fail-open。
 */

export type MemoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ShortTermPayload = {
  turns: MemoryTurn[];
  summary: string;
};

/** 最小 Redis 接口（ioredis 兼容；测试可注入 Fake）。 */
export type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
};

export type ShortTermRedisMemoryOptions = {
  redis: RedisLike | null;
  keyPrefix?: string;
  n?: number;
  ttlSeconds?: number;
  log?: (...args: unknown[]) => void;
};

const DEFAULT_PREFIX = "pgpt:short_memory";
const DEFAULT_N = 10;
const DEFAULT_TTL = 60 * 60 * 24; // 24h

function parsePayload(raw: string | null): ShortTermPayload {
  if (!raw) return { turns: [], summary: "" };
  try {
    const parsed = JSON.parse(raw) as Partial<ShortTermPayload>;
    const turns = Array.isArray(parsed.turns)
      ? parsed.turns.filter(
          (t): t is MemoryTurn =>
            !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string",
        )
      : [];
    return {
      turns,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch {
    return { turns: [], summary: "" };
  }
}

export class ShortTermRedisMemory {
  private readonly redis: RedisLike | null;
  private readonly keyPrefix: string;
  private readonly n: number;
  private readonly ttlSeconds: number;
  private readonly log: (...args: unknown[]) => void;

  constructor(opts: ShortTermRedisMemoryOptions) {
    this.redis = opts.redis;
    this.keyPrefix = (opts.keyPrefix ?? DEFAULT_PREFIX).replace(/:+$/, "");
    this.n = Math.max(1, opts.n ?? DEFAULT_N);
    this.ttlSeconds = opts.ttlSeconds ?? DEFAULT_TTL;
    this.log = opts.log ?? ((...args: unknown[]) => console.warn("[short-term-redis]", ...args));
  }

  memoryKey(workspaceId: string, userKey: string): string {
    return `${this.keyPrefix}:${workspaceId}:${userKey}`;
  }

  async appendTurn(workspaceId: string, userKey: string, turn: MemoryTurn): Promise<void> {
    if (!this.redis) {
      this.log("skip appendTurn: redis unavailable");
      return;
    }
    try {
      const key = this.memoryKey(workspaceId, userKey);
      const current = parsePayload(await this.redis.get(key));
      current.turns.push(turn);
      if (current.turns.length > this.n) {
        current.turns = current.turns.slice(-this.n);
      }
      await this.redis.set(key, JSON.stringify(current), "EX", this.ttlSeconds);
    } catch (err) {
      this.log("appendTurn failed (fail-open)", err);
    }
  }

  async maybeUpdateSummary(workspaceId: string, userKey: string, summary: string): Promise<void> {
    if (!this.redis) {
      this.log("skip maybeUpdateSummary: redis unavailable");
      return;
    }
    try {
      const key = this.memoryKey(workspaceId, userKey);
      const current = parsePayload(await this.redis.get(key));
      current.summary = summary.trim();
      if (current.turns.length > this.n) {
        current.turns = current.turns.slice(-this.n);
      }
      await this.redis.set(key, JSON.stringify(current), "EX", this.ttlSeconds);
    } catch (err) {
      this.log("maybeUpdateSummary failed (fail-open)", err);
    }
  }

  /**
   * 返回可注入 system/context 的文本块；失败或无数据时返回 ""（不抛错）。
   */
  async getContextBlock(workspaceId: string, userKey: string): Promise<string> {
    if (!this.redis) return "";
    try {
      const key = this.memoryKey(workspaceId, userKey);
      const current = parsePayload(await this.redis.get(key));
      if (!current.summary && current.turns.length === 0) return "";

      const parts: string[] = ["【短期记忆】"];
      if (current.summary) {
        parts.push(`滚动摘要：${current.summary}`);
      }
      if (current.turns.length) {
        parts.push("最近对话：");
        for (const t of current.turns) {
          const label = t.role === "user" ? "用户" : "助手";
          parts.push(`${label}：${t.content}`);
        }
      }
      return parts.join("\n");
    } catch (err) {
      this.log("getContextBlock failed (fail-open)", err);
      return "";
    }
  }
}

let singleton: ShortTermRedisMemory | undefined;

/**
 * 从 env 创建单例。无 REDIS_URL 时返回 fail-open 实例（redis=null）。
 * 懒加载 ioredis，避免未装包时模块 import 即炸。
 */
export async function getShortTermRedisMemory(): Promise<ShortTermRedisMemory> {
  if (singleton) return singleton;

  const keyPrefix = process.env.MEMORY_KEY_PREFIX?.trim() || DEFAULT_PREFIX;
  const nRaw = Number(process.env.SHORT_MEMORY_N ?? DEFAULT_N);
  const n = Number.isFinite(nRaw) && nRaw >= 1 ? Math.floor(nRaw) : DEFAULT_N;
  const url = process.env.REDIS_URL?.trim();

  if (!url) {
    singleton = new ShortTermRedisMemory({ redis: null, keyPrefix, n });
    return singleton;
  }

  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    client.on("error", (err: Error) => {
      console.warn("[short-term-redis] redis error", err.message);
    });
    try {
      await client.connect();
    } catch {
      // ioredis 某些版本 connect 已自动；忽略
    }
    singleton = new ShortTermRedisMemory({
      redis: client,
      keyPrefix,
      n,
    });
    return singleton;
  } catch (err) {
    console.warn("[short-term-redis] init failed (fail-open)", err);
    singleton = new ShortTermRedisMemory({ redis: null, keyPrefix, n });
    return singleton;
  }
}

/** 测试用：重置单例 */
export function resetShortTermRedisMemoryForTests(): void {
  singleton = undefined;
}
