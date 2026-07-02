const EMBEDDING_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2:free";

/**
 * 批量生成 embedding（复用 v0.1 OpenRouter 模型与维度）。
 */
export async function embedChunks(chunks: string[]): Promise<number[][]> {
  if (chunks.length === 0) return [];

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY required for embedChunks");
  }

  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: chunks,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter embedding failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { data: { embedding: number[] }[] };
  return data.data.map((item) => item.embedding);
}
