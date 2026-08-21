/**
 * @deprecated 请优先从 `./chat-provider` 导入。
 * 保留本文件以兼容 `@personal-gpt/shared/ai/groq-chat` 现有路径。
 */
export {
  chatModel,
  groqChatModel,
  resetChatProviderCache,
  resolveChatModels,
  resolveChatProvider,
  resolveChatProviderConfig,
  resolveRagHelperModel,
  type ChatProvider,
  type ChatProviderConfig,
} from "./chat-provider";
