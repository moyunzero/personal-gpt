export type HomeChatIdInput = {
  mode: string;
  threadId: string | null | undefined;
  /** retained for call-site compatibility; not encoded in id (model/corpus switches must not remount) */
  corpus?: string;
  isAuthenticated?: boolean | null;
  selectedModelId?: string | null | undefined;
};

/**
 * Stable chat id for useChat: mode + thread only.
 * Model/corpus changes must not remount the conversation (avoids wiping messages).
 */
export function buildHomeChatId(input: HomeChatIdInput): string {
  return ["home", input.mode, input.threadId || "none"].join(":");
}
