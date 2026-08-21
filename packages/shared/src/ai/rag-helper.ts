import { generateText } from "ai";

import { chatModel, resolveRagHelperModel } from "./chat-provider";

/** HyDE / Multi-Query / LLM 路由等轻量 RAG 辅助（Groq 8B 或 OpenAI 兼容模型） */
export async function generateRagHelperText(
  system: string,
  user: string,
  temperature = 0.2,
): Promise<string> {
  const { text } = await generateText({
    model: chatModel(resolveRagHelperModel()),
    system,
    prompt: user,
    temperature,
  });
  return text.trim();
}
