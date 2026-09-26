/** ASCII [S1] and the fullwidth forms models actually write: 【S1】 / ［S1］. */
const SOURCE_MARKER = /(?:\[|【|［)S(\d+)(?:\]|】|］)/g;
const SOURCE_MARKER_STRIP = /\s*(?:\[|【|［)S\d+(?:\]|】|］)/g;

function splitPartialSourceMarker(text: string): { emit: string; keep: string } {
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "]" || ch === "】" || ch === "］") break;
    if (ch === "[" || ch === "【" || ch === "［") {
      const rest = text.slice(i);
      if (/^(?:\[|【|［)S?\d*$/.test(rest)) {
        return { emit: text.slice(0, i), keep: rest };
      }
      break;
    }
  }
  return { emit: text, keep: "" };
}

/** Remove source numbers from text the user should read. */
export function stripSourceMarkers(text: string): string {
  return text.replace(SOURCE_MARKER_STRIP, "");
}

/** Hide [S n] across streamed chunks without dropping a marker split in two. */
export class SourceMarkerStripper {
  private carry = "";

  feed(delta: string): string {
    this.carry += delta;
    const { emit, keep } = splitPartialSourceMarker(this.carry);
    this.carry = keep;
    return stripSourceMarkers(emit);
  }

  flush(): string {
    const rest = stripSourceMarkers(this.carry);
    this.carry = "";
    return rest;
  }
}

function markerForCitation(citation: unknown, index: number): number {
  const explicit =
    citation && typeof citation === "object" && "sourceNumber" in citation
      ? (citation as { sourceNumber?: unknown }).sourceNumber
      : undefined;
  if (typeof explicit === "number" && Number.isInteger(explicit) && explicit >= 1) return explicit;
  return index + 1;
}

/**
 * Keep citations whose [S n] matches sourceNumber, or array position when
 * sourceNumber is absent. Out-of-range and repeated markers are dropped.
 * Order follows the citation array, not the order markers appear in the text.
 */
export function filterCitationsBySourceMarkers<T>(
  answerText: string,
  citations: readonly T[],
): T[] {
  const indexByMarker = new Map<number, number>();
  citations.forEach((citation, index) => {
    const marker = markerForCitation(citation, index);
    if (!indexByMarker.has(marker)) indexByMarker.set(marker, index);
  });
  const seen = new Set<number>();
  for (const match of answerText.matchAll(SOURCE_MARKER)) {
    const n = Number(match[1]);
    if (!Number.isInteger(n) || n < 1) continue;
    const index = indexByMarker.get(n);
    if (index === undefined || seen.has(index)) continue;
    seen.add(index);
  }
  return citations.filter((_, index) => seen.has(index));
}
