/** [S10] stays the 10th item; a single digit after S would clip it to [S1]. */
const SOURCE_MARKER = /\[S(\d+)\]/g;

/**
 * Keep citations whose 1-based [S n] marker appears in the answer.
 * Out-of-range and repeated markers are dropped. Order follows the citation
 * array, not the order markers appear in the text.
 */
export function filterCitationsBySourceMarkers<T>(
  answerText: string,
  citations: readonly T[],
): T[] {
  const seen = new Set<number>();
  for (const match of answerText.matchAll(SOURCE_MARKER)) {
    const n = Number(match[1]);
    if (!Number.isInteger(n) || n < 1) continue;
    const index = n - 1;
    if (index >= citations.length || seen.has(index)) continue;
    seen.add(index);
  }
  return citations.filter((_, index) => seen.has(index));
}
