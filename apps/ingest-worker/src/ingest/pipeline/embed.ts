import { embedTexts } from "@personal-gpt/shared/ai/embeddings";

/**
 * 批量生成 embedding（NVIDIA NIM 2048 维，与聊天侧检索维度一致）。
 */
export async function embedChunks(chunks: string[]): Promise<number[][]> {
  return embedTexts(chunks);
}
