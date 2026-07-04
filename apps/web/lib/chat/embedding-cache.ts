/**
 * 一个最小可用的 LRU 缓存，专给 query→embedding 向量复用。
 *
 * 为什么自己写：
 *   - 只需要 get / set / 容量上限 / hit-miss 计数四件事；
 *   - 引 lru-cache npm 包会多一层依赖与产物体积；
 *   - JavaScript Map 自带"按插入顺序遍历"语义，结合 delete+set 就能实现 LRU，
 *     总共不过 30 行，比 README 一段还短。
 *
 * 不做的事（YAGNI）：
 *   - TTL：嵌入是确定性的，没必要过期；
 *   - 跨实例共享（Redis 等）：本应用是单进程 Next.js Function，
 *     冷启动后缓存重建可接受；
 *   - 序列化持久化：同上。
 */
export class EmbeddingCache {
  private readonly store = new Map<string, number[]>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxSize: number) {
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new Error(`EmbeddingCache maxSize must be a positive integer, got ${maxSize}`);
    }
  }

  /**
   * 命中则刷新到「最新」位置并自增 hits；未命中自增 misses。
   */
  get(key: string): number[] | undefined {
    const value = this.store.get(key);
    if (value === undefined) {
      this.misses++;
      return undefined;
    }
    // 重新插入以把它移到 Map 末尾（最新使用位）
    this.store.delete(key);
    this.store.set(key, value);
    this.hits++;
    return value;
  }

  /**
   * 写入时如果 key 已存在，先删后写以更新位置；
   * 容量超限则淘汰最早插入的 entry（Map.keys() 的第一项）。
   */
  set(key: string, value: number[]): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, value);
  }

  size(): number {
    return this.store.size;
  }

  stats(): { hits: number; misses: number; size: number; maxSize: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size,
      maxSize: this.maxSize,
    };
  }
}

/**
 * 把 query 归一化成缓存 key。
 *
 * 目前只 trim 首尾空白：embedding 模型对大小写、标点都敏感，过度归一化
 * 会让"问 X" / "问 X！" 共用一份向量但回答错位。trim 是最安全的统一化。
 */
export function makeEmbeddingCacheKey(query: string): string {
  return query.trim();
}
