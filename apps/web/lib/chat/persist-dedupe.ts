export type PersistMessageLike = {
  role: "user" | "assistant" | string;
  content: string;
};

/**
 * Skip insert when the same user+assistant turn was just persisted (double-fire / race).
 */
export function isDuplicateChatTurn(
  recent: PersistMessageLike[],
  userContent: string,
  assistantContent: string,
): boolean {
  const trimmedUser = userContent.trim();
  const trimmedAssistant = assistantContent.trim();
  if (!trimmedAssistant) return true;

  // Exact last pair match
  if (
    recent.length >= 2 &&
    recent[0]?.role === "assistant" &&
    recent[0].content === trimmedAssistant &&
    recent[1]?.role === "user" &&
    recent[1].content === trimmedUser
  ) {
    return true;
  }

  // Same assistant content already last + matching user anywhere in recent window
  if (recent[0]?.role === "assistant" && recent[0].content === trimmedAssistant) {
    if (!trimmedUser) return true;
    if (recent.some((m) => m.role === "user" && m.content === trimmedUser)) return true;
  }

  return false;
}
