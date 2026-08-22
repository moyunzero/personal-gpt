import { GRAPH_RELATION_RE } from "./l0-rules";
import type { KbProbeResult, L1Signals } from "./types";

export interface CollectL1SignalsDeps {
  probeKb?: (query: string) => Promise<KbProbeResult>;
  routeRetrieveSimilarity?: number;
  routeDirectSimilarity?: number;
}

function detectGraphSignal(query: string): boolean {
  if (!GRAPH_RELATION_RE.test(query)) return false;
  return /珍珠奶茶|pearl\s*milk\s*tea|奶茶|milk\s*tea/i.test(query);
}

export async function collectL1Signals(
  query: string,
  deps: CollectL1SignalsDeps = {},
): Promise<L1Signals> {
  const retrieveAt = deps.routeRetrieveSimilarity ?? 0.68;
  const directBelow = deps.routeDirectSimilarity ?? 0.42;

  const graphSignal = detectGraphSignal(query);
  const signals: L1Signals = { graphSignal };

  if (!deps.probeKb) {
    signals.reason = graphSignal ? "l1:graph_entity" : "l1:no_probe";
    return signals;
  }

  const kb = await deps.probeKb(query);
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
