import { generateRagHelperText } from "@personal-gpt/shared/ai/rag-helper";
import type { RetrievedChunk } from "@personal-gpt/shared/stores/vector-store";
import { z } from "zod";

import { RETRIEVAL_LIMIT } from "./rag-options";

const RerankSchema = z.object({
  order: z.array(z.number().int().min(0)).min(1),
});

/**
 * LLM 重排（参考 advanced-rag：初筛 Top-N → 语义重排 Top-K）。
 * 失败时回退为向量相似度排序。
 */
export async function rerankHitsWithLlm(
  query: string,
  hits: RetrievedChunk[],
  limit: number = RETRIEVAL_LIMIT,
): Promise<RetrievedChunk[]> {
  if (hits.length <= 1) {
    return hits.slice(0, limit);
  }

  const catalog = hits
    .map(
      (hit, index) =>
        `[${index}] similarity=${hit.similarity.toFixed(3)} title=${hit.title ?? "未命名"}\n${hit.text.slice(0, 400)}`,
    )
    .join("\n\n");

  const raw = await generateRagHelperText(
    `你是检索重排器。根据用户问题，对候选片段按相关性从高到低排序。
只输出 JSON：{"order":[片段编号,...]}，编号来自下方 [0]、[1]...
无关片段可省略；至少保留 1 个最相关片段。`,
    `用户问题：${query}\n\n候选片段：\n${catalog}`,
    0,
  );

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return [...hits].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  try {
    const { order } = RerankSchema.parse(JSON.parse(jsonMatch[0]));
    const seen = new Set<number>();
    const ranked: RetrievedChunk[] = [];

    for (const index of order) {
      if (seen.has(index) || index >= hits.length) {
        continue;
      }
      seen.add(index);
      ranked.push(hits[index]);
      if (ranked.length >= limit) {
        break;
      }
    }

    if (ranked.length === 0) {
      return [...hits].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    }

    return ranked;
  } catch {
    return [...hits].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }
}
