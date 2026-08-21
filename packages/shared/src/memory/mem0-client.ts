/**
 * Mem0 长期记忆封装（MEM-02 / D-16 / D-18 / D-19）。
 * userId = `${workspaceId}:${userKey}`；仅写入显式偏好与稳定事实，禁止全文聊天入库。
 */

export type Mem0Message = { role: "user" | "assistant"; content: string };

export type Mem0SearchHit = {
  memory: string;
  score?: number;
  id?: string;
};

/** 可注入的底层客户端（生产用 mem0ai MemoryClient；测试用 mock）。 */
export type Mem0RawClient = {
  add(
    messages: Mem0Message[],
    options: { userId: string },
  ): Promise<unknown>;
  search(
    query: string,
    options: { filters: { user_id: string }; topK?: number },
  ): Promise<{ results?: Array<{ memory?: string; score?: number; id?: string }> }>;
};

export type ScopedMem0Client = {
  addStableFacts(workspaceId: string, userKey: string, facts: string[]): Promise<void>;
  searchMemories(workspaceId: string, userKey: string, query: string): Promise<Mem0SearchHit[]>;
};

const DEFAULT_TOP_K = 5;

/** D-18：无登录时记忆作用域 = workspaceId + userKey */
export function memoryUserId(workspaceId: string, userKey: string): string {
  return `${workspaceId}:${userKey}`;
}

function isMem0Enabled(): boolean {
  if (process.env.MEM0_ENABLED === "false") return false;
  return Boolean(process.env.MEM0_API_KEY?.trim());
}

/**
 * 仅接受已筛选的稳定事实/偏好字符串列表（D-19）。
 * 刻意不提供「整段 transcript → add」的 API，避免全文聊天入库。
 */
export function createScopedMem0Client(
  raw: Mem0RawClient | null,
  opts?: { topK?: number; log?: (...args: unknown[]) => void },
): ScopedMem0Client {
  const topK = opts?.topK ?? DEFAULT_TOP_K;
  const log = opts?.log ?? ((...args: unknown[]) => console.warn("[mem0]", ...args));

  return {
    async addStableFacts(workspaceId, userKey, facts) {
      if (!raw) {
        log("addStableFacts skipped: Mem0 disabled or missing MEM0_API_KEY");
        return;
      }
      const cleaned = facts.map((f) => f.trim()).filter((f) => f.length > 0);
      if (!cleaned.length) return;

      // 每条事实独立写入；不用完整对话历史
      const messages: Mem0Message[] = cleaned.map((fact) => ({
        role: "user",
        content: fact,
      }));

      try {
        await raw.add(messages, { userId: memoryUserId(workspaceId, userKey) });
      } catch (err) {
        log("addStableFacts failed (degraded)", err);
      }
    },

    async searchMemories(workspaceId, userKey, query) {
      if (!raw) return [];
      const q = query.trim();
      if (!q) return [];
      try {
        const res = await raw.search(q, {
          filters: { user_id: memoryUserId(workspaceId, userKey) },
          topK,
        });
        return (res.results ?? [])
          .map((r) => ({
            memory: typeof r.memory === "string" ? r.memory : "",
            score: r.score,
            id: r.id,
          }))
          .filter((h) => h.memory.length > 0);
      } catch (err) {
        log("searchMemories failed (degraded → [])", err);
        return [];
      }
    },
  };
}

let cached: ScopedMem0Client | undefined;
let cachedRaw: Mem0RawClient | null | undefined;

/**
 * 懒加载 mem0ai。无 key / MEM0_ENABLED=false → 降级空实现（不抛错）。
 * add 可能返回 PENDING（Pitfall 4）；调用方 / 测试应使用 mock，勿依赖即时可读。
 */
export async function getMem0Client(): Promise<ScopedMem0Client> {
  if (cached) return cached;

  if (!isMem0Enabled()) {
    cachedRaw = null;
    cached = createScopedMem0Client(null);
    return cached;
  }

  try {
    const mod = await import("mem0ai");
    const MemoryClient = (mod as { MemoryClient?: new (o: { apiKey: string }) => Mem0RawClient })
      .MemoryClient;
    const Default = (mod as { default?: new (o: { apiKey: string }) => Mem0RawClient }).default;
    const Ctor = MemoryClient ?? Default;
    if (!Ctor) throw new Error("mem0ai MemoryClient export missing");

    const apiKey = process.env.MEM0_API_KEY!.trim();
    cachedRaw = new Ctor({ apiKey });
    cached = createScopedMem0Client(cachedRaw);
    return cached;
  } catch (err) {
    console.warn("[mem0] init failed (degraded)", err);
    cachedRaw = null;
    cached = createScopedMem0Client(null);
    return cached;
  }
}

/** 测试注入：绕过真实 SDK */
export function setMem0ClientForTests(client: ScopedMem0Client | null): void {
  cached = client ?? undefined;
  if (client === null) cachedRaw = undefined;
}

export function resetMem0ClientForTests(): void {
  cached = undefined;
  cachedRaw = undefined;
}

/** 将 search hits 格式化为可注入 system 的文本块 */
export function formatMem0ContextBlock(hits: Mem0SearchHit[]): string {
  if (!hits.length) return "";
  return `【长期记忆】\n${hits.map((h) => `- ${h.memory}`).join("\n")}`;
}
