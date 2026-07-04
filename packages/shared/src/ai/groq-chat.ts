import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

function requireGroqApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY 未设置");
  }
  return apiKey;
}

let groqProvider: ReturnType<typeof createOpenAICompatible> | undefined;

function getGroqProvider() {
  groqProvider ??= createOpenAICompatible({
    name: "groq",
    baseURL: GROQ_BASE_URL,
    apiKey: requireGroqApiKey(),
  });
  return groqProvider;
}

/** Groq 聊天模型（OpenAI 兼容 API，免费层无需绑卡） */
export function groqChatModel(modelId: string) {
  return getGroqProvider().chatModel(modelId);
}
