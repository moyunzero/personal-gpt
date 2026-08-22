import { z } from "zod";

import { generateRagHelperText } from "../ai/rag-helper";
import { PrimaryIntentSchema, type IntentPlan } from "./types";

const L2HintSchema = z.object({
  primary: PrimaryIntentSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  ambiguous: z.boolean().optional(),
});

const L2_RESPONSE_SCHEMA = z.object({
  primary: PrimaryIntentSchema,
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
});

const L2_SYSTEM = `你是企业知识库意图分类器。仅输出 JSON，不要 markdown。
枚举 primary：chitchat | general | kb_doc | graph_relation | kb_graph_hybrid | web_research | analytics | report | multi_step
示例：{"primary":"kb_doc","confidence":0.8,"reason":"询问内部文档"}`;

export type ClassifyL2Fn = (query: string) => Promise<Partial<IntentPlan> | null>;

/** Optional L2 JSON classifier — fail-open on invalid JSON (T-03.1-01-01) */
export async function classifyIntentL2(
  query: string,
  classifyFn?: ClassifyL2Fn,
): Promise<Partial<IntentPlan> | null> {
  if (classifyFn) return classifyFn(query);

  try {
    const raw = await generateRagHelperText(L2_SYSTEM, query, 0);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = L2_RESPONSE_SCHEMA.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) return null;
    const hint = L2HintSchema.safeParse(parsed.data);
    if (!hint.success) return null;
    return hint.data;
  } catch {
    return null;
  }
}

export function needsL2(
  l0: import("./types").L0Hit | null | undefined,
  l1: import("./types").L1Signals | undefined,
): boolean {
  if (l0?.terminal) return false;
  if (!l1?.kb?.probed) return true;
  return Boolean(l1.kbGray);
}
