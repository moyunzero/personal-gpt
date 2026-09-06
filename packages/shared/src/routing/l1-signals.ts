import { hasGraphRelationCue } from "./l0-rules";
import { resolveGraphEntity } from "./entity-resolve";
import type { EntityCatalogStore } from "../graph/entity-catalog";
import type { KbProbeResult, L1Signals } from "./types";

export interface CollectL1SignalsDeps {
  workspaceId?: string;
  catalogStore?: EntityCatalogStore;
  probeKb?: (query: string) => Promise<KbProbeResult>;
  routeRetrieveSimilarity?: number;
  routeDirectSimilarity?: number;
}

async function detectGraphSignal(query: string, deps: CollectL1SignalsDeps): Promise<boolean> {
  if (!hasGraphRelationCue(query)) return false;
  const entity = await resolveGraphEntity(query, deps.workspaceId, {
    catalogStore: deps.catalogStore,
  });
  return entity !== null;
}

export async function collectL1Signals(
  query: string,
  deps: CollectL1SignalsDeps = {},
): Promise<L1Signals> {
  const retrieveAt = deps.routeRetrieveSimilarity ?? 0.68;
  const directBelow = deps.routeDirectSimilarity ?? 0.42;

  const graphSignal = await detectGraphSignal(query, deps);
  const signals: L1Signals = { graphSignal };

  if (!deps.probeKb) {
    signals.reason = graphSignal ? "l1:graph_entity" : "l1:no_probe";
    return signals;
  }

  let kb: KbProbeResult;
  try {
    kb = await deps.probeKb(query);
  } catch {
    signals.reason = graphSignal ? "l1:graph_entity_unprobed" : "l1:kb_unprobed";
    return signals;
  }
  signals.kb = kb;

  if (!kb.probed) {
    signals.reason = graphSignal ? "l1:graph_entity_unprobed" : "l1:kb_unprobed";
    return signals;
  }

  if (kb.topSimilarity >= retrieveAt) {
    signals.kbHigh = true;
    signals.reason = `l1:kb_high:${kb.topSimilarity.toFixed(3)}`;
  } else if (kb.topSimilarity < directBelow) {
    signals.kbLow = true;
    signals.reason = `l1:kb_low:${kb.topSimilarity.toFixed(3)}`;
  } else {
    signals.kbGray = true;
    signals.reason = `l1:kb_gray:${kb.topSimilarity.toFixed(3)}`;
  }

  return signals;
}

export function l1SuggestsKbDoc(signals: L1Signals): boolean {
  return Boolean(signals.kbHigh || signals.kbGray);
}

export function l1SuggestsGeneral(signals: L1Signals): boolean {
  return Boolean(signals.kbLow);
}
