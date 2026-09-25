import type { OutfitScore } from '../_shared/catalog/outfitScoring.ts';

/** Additive generate-outfit JSON fields. The client may ignore these. */
export type FashionScoreFields = {
  fashion_score: number;
  fashion_breakdown: OutfitScore['breakdown'];
  fashion_issues: string[];
  fashion_suggestions: string[];
};

export function toFashionResponseFields(result: OutfitScore): FashionScoreFields {
  return {
    fashion_score: result.score,
    fashion_breakdown: result.breakdown,
    fashion_issues: result.issues,
    fashion_suggestions: result.suggestions,
  };
}

/** Debug the scorer. Never log measurements, skin tone, or catalog rows. */
export function logOutfitScore(input: {
  score: number;
  style: string;
  occasion: string;
  breakdown: OutfitScore['breakdown'];
  issues: string[];
}): void {
  console.log(
    `[OUTFIT_SCORE] ${JSON.stringify({
      score: input.score,
      style: input.style,
      occasion: input.occasion,
      breakdown: input.breakdown,
      issues: input.issues,
    })}`,
  );
}
