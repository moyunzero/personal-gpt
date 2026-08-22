import { z } from "zod";

/** D-02: nine primary intents for Chat + Agent routing */
export const PrimaryIntentSchema = z.enum([
  "chitchat",
  "general",
  "kb_doc",
  "graph_relation",
  "kb_graph_hybrid",
  "web_research",
  "analytics",
  "report",
  "multi_step",
]);
export type PrimaryIntent = z.infer<typeof PrimaryIntentSchema>;

export const RetrievalChannelSchema = z.enum(["none", "kb", "graph", "kb+graph", "web"]);
export type RetrievalChannel = z.infer<typeof RetrievalChannelSchema>;

export const RouterLayerSchema = z.enum(["L0", "L1", "L2"]);
export type RouterLayer = z.infer<typeof RouterLayerSchema>;

export type SpecialistName = "retriever" | "researcher" | "analyst" | "editor";

/**
 * D-02 IntentPlan contract — consumed by Chat route mapping and AgentTraceIntent (Wave 2).
 * `retrieverTools` is a **hard whitelist**: Retriever may only bind tools listed here.
 */
export const IntentPlanSchema = z.object({
  primary: PrimaryIntentSchema,
  channels: RetrievalChannelSchema,
  specialists: z.array(z.string()),
  /** Hard whitelist — Retriever must not bind tools outside this list (D-02) */
  retrieverTools: z.array(z.string()),
  fallbackChain: z.array(z.string()),
  reason: z.string(),
  confidence: z.number(),
  /** D-13: KB miss may auto graph_search only when true or fallbackChain includes graph */
  graphSignal: z.boolean().optional(),
  /** D-16: Agent supervisor path only — Chat ignores this field */
  ambiguous: z.boolean().optional(),
});
export type IntentPlan = z.infer<typeof IntentPlanSchema>;

/** L0 rule hit — `terminal: true` skips L1 embedding precheck (D-03 / Pitfall 3) */
export interface L0Hit {
  primary: PrimaryIntent;
  channels?: RetrievalChannel;
  specialists: SpecialistName[];
  retrieverTools: string[];
  reason: string;
  terminal: boolean;
  graphSignal?: boolean;
}

/** Mirrors apps/web embedding-precheck result shape for injectable L1 probe */
export interface KbProbeResult {
  topSimilarity: number;
  title?: string;
  probed: boolean;
}

export interface L1Signals {
  kb?: KbProbeResult;
  graphSignal?: boolean;
  reason?: string;
  kbHigh?: boolean;
  kbLow?: boolean;
  kbGray?: boolean;
}

export interface SynthesizeInput {
  query: string;
  l0?: L0Hit | null;
  l1?: L1Signals;
  l2Hint?: Partial<IntentPlan> | null;
  neo4jOk?: boolean;
  config?: import("./config").IntentRouterConfig;
}
