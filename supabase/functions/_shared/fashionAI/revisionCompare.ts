import type { OutfitScore } from '../catalog/outfitScoring.ts';

/**
 * Ignore +1 (or equal/lower) swings so a revision only lands when the
 * deterministic scorer sees a real improvement, not noise.
 */
export const MIN_REVISION_IMPROVEMENT = 2;

export function countChangedItems(originalIds: string[], revisedIds: string[]): number {
  const original = new Set(originalIds);
  const revised = new Set(revisedIds);
  const added = [...revised].filter((id) => !original.has(id)).length;
  const removed = [...original].filter((id) => !revised.has(id)).length;
  return Math.max(added, removed);
}

export function shouldAcceptRevision(
  original: OutfitScore,
  revised: OutfitScore,
): boolean {
  return revised.score >= original.score + MIN_REVISION_IMPROVEMENT;
}

/** Defensive compare if two improved revisions ever need ranking. */
export function compareImprovedRevisions(
  a: { score: OutfitScore; changedItems: number },
  b: { score: OutfitScore; changedItems: number },
): number {
  if (b.score.score !== a.score.score) return b.score.score - a.score.score;
  if (a.changedItems !== b.changedItems) return a.changedItems - b.changedItems;
  if (b.score.breakdown.cohesion !== a.score.breakdown.cohesion) {
    return b.score.breakdown.cohesion - a.score.breakdown.cohesion;
  }
  if (b.score.breakdown.style !== a.score.breakdown.style) {
    return b.score.breakdown.style - a.score.breakdown.style;
  }
  if (b.score.breakdown.color !== a.score.breakdown.color) {
    return b.score.breakdown.color - a.score.breakdown.color;
  }
  return b.score.breakdown.proportion - a.score.breakdown.proportion;
}
