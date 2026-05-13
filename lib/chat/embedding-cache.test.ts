import { describe, it, expect } from "vitest";

import { EmbeddingCache, makeEmbeddingCacheKey } from "./embedding-cache";

describe("EmbeddingCache", () => {
  it("构造时 maxSize<1 抛错", () => {
    expect(() => new EmbeddingCache(0)).toThrow();
    expect(() => new EmbeddingCache(-1)).toThrow();
    expect(() => new EmbeddingCache(1.5)).toThrow();
  });

  it("未命中返回 undefined 并自增 misses", () => {
    const cache = new EmbeddingCache(2);
    expect(cache.get("foo")).toBeUndefined();
    expect(cache.stats()).toMatchObject({ hits: 0, misses: 1, size: 0 });
  });

  it("set 后能 get 到、并自增 hits", () => {
    const cache = new EmbeddingCache(2);
    cache.set("hello", [0.1, 0.2]);
    expect(cache.get("hello")).toEqual([0.1, 0.2]);
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 0, size: 1 });
  });

  it("超过 maxSize 时淘汰最旧的 entry", () => {
    const cache = new EmbeddingCache(2);
    cache.set("a", [1]);
    cache.set("b", [2]);
    cache.set("c", [3]);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toEqual([2]);
    expect(cache.get("c")).toEqual([3]);
  });

  it("get 命中会把 entry 刷到最新，防止被错误淘汰", () => {
    const cache = new EmbeddingCache(2);
    cache.set("a", [1]);
    cache.set("b", [2]);
    // get a → a 变成最新，b 成为最旧
    expect(cache.get("a")).toEqual([1]);
    // 写入 c 应当淘汰 b 而非 a
    cache.set("c", [3]);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toEqual([1]);
    expect(cache.get("c")).toEqual([3]);
  });

  it("重复 set 同 key 不增长 size、只更新值", () => {
    const cache = new EmbeddingCache(2);
    cache.set("a", [1]);
    cache.set("a", [9]);
    expect(cache.size()).toBe(1);
    expect(cache.get("a")).toEqual([9]);
  });

  it("stats 累计 hits / misses", () => {
    const cache = new EmbeddingCache(2);
    cache.set("a", [1]);
    cache.get("a"); // hit
    cache.get("a"); // hit
    cache.get("b"); // miss
    expect(cache.stats()).toMatchObject({ hits: 2, misses: 1, size: 1 });
  });
});

describe("makeEmbeddingCacheKey", () => {
  it("trim 首尾空白", () => {
    expect(makeEmbeddingCacheKey("  hello\n")).toBe("hello");
  });

  it("不改变大小写、标点、中文", () => {
    expect(makeEmbeddingCacheKey("你好！MoYun")).toBe("你好！MoYun");
    expect(makeEmbeddingCacheKey("Hello?")).toBe("Hello?");
  });
});
