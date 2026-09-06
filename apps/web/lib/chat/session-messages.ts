/** Map persisted DB rows to useChat UIMessage shape. */
export type PersistedChatMessage = {
  id: string;
  role: string;
  content: string;
};

export type UiChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: { type: "text"; text: string }[];
};

export function mapPersistedMessages(rows: PersistedChatMessage[]): UiChatMessage[] {
  return rows.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant" | "system",
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

export function sessionCacheKey(mode: string, threadId: string): string {
  return `${mode}:${threadId}`;
}
