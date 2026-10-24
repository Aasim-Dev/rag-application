/**
 * Reciprocal Rank Fusion (RRF): merge several ranked lists into one.
 *
 * Hybrid search runs two searches that score on different scales: cosine similarity (0..1) for
 * vectors and ts_rank (unbounded) for keywords. Adding raw scores would be meaningless, so RRF
 * uses only each item's *rank*: score = sum over lists of 1 / (k + rank). Items found by both
 * searches rise to the top; k (60 in the original paper) dampens how much the very first rank matters.
 */
export function reciprocalRankFusion<T extends { id: string | number }>(
  lists: T[][],
  k = 60,
): Array<T & { fusedScore: number }> {
  const byId = new Map<string | number, { item: T; score: number }>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const entry = byId.get(item.id) ?? { item, score: 0 };
      entry.score += 1 / (k + rank + 1);
      byId.set(item.id, entry);
    });
  }
  return [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ item, score }) => ({ ...item, fusedScore: score }));
}
