export type HomeChatIdInput = {
  mode: string;
  threadId: string | null | undefined;
  corpus: string;
  isAuthenticated: boolean | null;
  selectedModelId: string | null | undefined;
};

/** Encode mode/thread/corpus/model so useChat recreates when settings change (D-01). */
export function buildHomeChatId(input: HomeChatIdInput): string {
  return [
    "home",
    input.mode,
    input.threadId || "none",
    input.isAuthenticated === false ? "seed" : input.corpus,
    input.selectedModelId || "default",
  ].join(":");
}
