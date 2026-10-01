import { SystemMessage } from "@langchain/core/messages";

import { RETRIEVAL_UNAVAILABLE_HINT } from "./agent-synthesis";
import type { RaceExternalResult } from "./race-external-call";

/** When a raceExternalCall fails, seed synthesizer with retrieval-unavailable hint. */
export function pushRetrievalErrorIfFailed(
  seeds: SystemMessage[],
  race: RaceExternalResult<unknown>,
): boolean {
  if (race.ok) return false;
  seeds.push(new SystemMessage(RETRIEVAL_UNAVAILABLE_HINT));
  return true;
}
