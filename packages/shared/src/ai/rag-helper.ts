import { generateText } from "ai";

import { groqChatModel } from "./groq-chat";
import { GROQ_RAG_HELPER_MODEL } from "./groq-models";

/** HyDE / Multi-Query / LLM 路由等轻量 RAG 辅助，走 Groq 8B（国内可访问） */
export async function generateRagHelperText(
  system: string,
  user: string,
  temperature = 0.2,
): Promise<string> {
  const { text } = await generateText({
    model: groqChatModel(GROQ_RAG_HELPER_MODEL),
    system,
    prompt: user,
    temperature,
  });
  return text.trim();
}
