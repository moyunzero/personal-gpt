import type { RetrievedChunk } from "../stores/vector-store";
import { generateRagHelperText } from "../ai/rag-helper";
import { z } from "zod";

const RerankOrderSchema = z.object({
  order: z.array(z.number().int().min(0)).min(1),
});

interface DedicatedRerankResponse {
  results?: Array<{ index: number; relevance_score?: number }>;
}

/**
 * Dedicated HTTP rerank (OpenRouter/Cohere-compatible) with thin LLM fallback.
 * ENABLE_RERANKER=false skips callers; this function always attempts when invoked.
 */
export async function rerankDedicated(
  query: string,
  hits: RetrievedChunk[],
  limit?: number,
): Promise<RetrievedChunk[]> {
  const topN = limit ?? hits.length;
  if (hits.length <= 1) {
    return hits.slice(0, topN);
  }

  const url = process.env.RERANK_URL?.trim();
  const apiKey = process.env.RERANK_API_KEY?.trim();
  const model = process.env.RERANK_MODEL?.trim() || "cohere/rerank-v3.5";

  if (url && apiKey) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          query,
          documents: hits.map((h) => h.text),
          top_n: topN,
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as DedicatedRerankResponse;
        const ranked = mapDedicatedResults(hits, body.results ?? [], topN);
        if (ranked.length > 0) return ranked;
      }
    } catch {
      // fall through to LLM
    }
  }

  return rerankWithLlmFallback(query, hits, topN);
}

function mapDedicatedResults(
  hits: RetrievedChunk[],
  results: Array<{ index: number; relevance_score?: number }>,
  topN: number,
): RetrievedChunk[] {
  const ranked: RetrievedChunk[] = [];
  const seen = new Set<number>();
  for (const row of results) {
    const index = row.index;
    if (seen.has(index) || index < 0 || index >= hits.length) continue;
    seen.add(index);
    const hit = hits[index]!;
    ranked.push({
      ...hit,
      similarity: typeof row.relevance_score === "number" ? row.relevance_score : hit.similarity,
    });
    if (ranked.length >= topN) break;
  }
  return ranked;
}

/** Thin LLM fallback (mirrors apps/web/lib/chat/reranker.ts). */
async function rerankWithLlmFallback(
  query: string,
  hits: RetrievedChunk[],
  limit: number,
): Promise<RetrievedChunk[]> {
  const catalog = hits
    .map(
      (hit, index) =>
        `[${index}] similarity=${hit.similarity.toFixed(3)} title=${hit.title ?? "未命名"}\n${hit.text.slice(0, 400)}`,
    )
    .join("\n\n");

  try {
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
    const { order } = RerankOrderSchema.parse(JSON.parse(jsonMatch[0]));
    const seen = new Set<number>();
    const ranked: RetrievedChunk[] = [];
    for (const index of order) {
      if (seen.has(index) || index >= hits.length) continue;
      seen.add(index);
      ranked.push(hits[index]!);
      if (ranked.length >= limit) break;
    }
    if (ranked.length === 0) {
      return [...hits].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    }
    return ranked;
  } catch {
    return [...hits].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }
}
