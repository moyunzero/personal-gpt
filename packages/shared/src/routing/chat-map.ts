import type { IntentPlan, PrimaryIntent } from "./types";

export type ChatQueryRoute = "direct" | "retrieve";

export interface ChatRouteDecision {
  route: ChatQueryRoute;
  reason: string;
  needsGraphContext?: boolean;
  graphContextType?: "graph_relation";
}

function directIntents(): PrimaryIntent[] {
  return ["chitchat", "general", "analytics", "report"];
}

/** D-16: Agent-only — true when plan should use Supervisor hub-and-spoke */
export function isPlanAmbiguous(plan: IntentPlan): boolean {
  return plan.ambiguous === true;
}

/**
 * D-07/D-16: map IntentPlan → Chat direct|retrieve.
 * Gray L1 band defaults to retrieve (retrieve_safe).
 */
export function mapIntentPlanToChatRoute(plan: IntentPlan): ChatRouteDecision {
  if (plan.primary === "graph_relation") {
    return {
      route: "retrieve",
      reason: plan.reason,
      needsGraphContext: true,
      graphContextType: "graph_relation",
    };
  }

  if (plan.primary === "kb_graph_hybrid") {
    return {
      route: "retrieve",
      reason: plan.reason,
      needsGraphContext: true,
      graphContextType: "graph_relation",
    };
  }

  if (plan.primary === "kb_doc" || plan.primary === "multi_step") {
    return { route: "retrieve", reason: plan.reason };
  }

  if (plan.primary === "web_research") {
    return { route: "retrieve", reason: `${plan.reason};web_intent` };
  }

  if (directIntents().includes(plan.primary)) {
    if (plan.reason.includes("retrieve_safe") || plan.reason.includes("kb_gray")) {
      return { route: "retrieve", reason: plan.reason };
    }
    return { route: "direct", reason: plan.reason };
  }

  return { route: "direct", reason: plan.reason };
}

/** Mark Chat gray-zone retrieve_safe when L1 similarity is in gray band */
export function chatRetrieveSafeReason(l1Reason: string): string {
  return `${l1Reason};retrieve_safe`;
}
