import type { OutfitScore, OutfitScoreBreakdown } from '../_shared/catalog/outfitScoring.ts';
import { GeminiGenerationError } from '../_shared/geminiResponse.ts';
import {
  type PreviousOutfitItem,
  REBUILD_FASHION_BAND,
  candidatesShareTooManyProducts,
  containsExcludedProduct,
  outfitDiversityScore,
  type DiversityProduct,
} from './outfitDiversity.ts';

export const GEMINI_CANDIDATE_LIMIT = 5;

export type AiItem = {
  product_id: string;
  reason: string;
};

export type AiOutfit = {
  outfit_name: string;
  items: AiItem[];
  styling_tip: string;
};

export type ScoredOutfitCandidate<T> =
  | {
      valid: true;
      index: number;
      score: number;
      breakdown: OutfitScoreBreakdown;
      issues: string[];
      suggestions: string[];
      fashion: OutfitScore;
      outfit: AiOutfit;
      built: T;
    }
  | {
      valid: false;
      index: number;
      reason: string;
    };

function readId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readItems(value: unknown, minItems: number): AiItem[] | null {
  if (!Array.isArray(value) || value.length < minItems) return null;
  const items: AiItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const productId = readId((item as { product_id?: unknown }).product_id);
    if (!productId) return null;
    const reason = (item as { reason?: unknown }).reason;
    items.push({
      product_id: productId,
      reason: typeof reason === 'string' ? reason : '',
    });
  }
  return items;
}

function fromSlotCandidate(
  raw: Record<string, unknown>,
  fallbackReason: string,
  requireShoes: boolean,
): AiItem[] | null {
  const top = readId(raw.top_id);
  const bottom = readId(raw.bottom_id);
  const shoes = readId(raw.shoes_id);
  if (!top || !bottom || (requireShoes && !shoes)) return null;
  const reason = typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason : fallbackReason;
  const items: AiItem[] = [
    { product_id: top, reason },
    { product_id: bottom, reason },
  ];
  if (shoes) items.push({ product_id: shoes, reason });
  const outerwear = readId(raw.outerwear_id);
  const accessory = readId(raw.accessory_id);
  if (outerwear) items.push({ product_id: outerwear, reason });
  if (accessory) items.push({ product_id: accessory, reason });
  return items;
}

function toAiOutfit(
  raw: unknown,
  fallbackName: string,
  fallbackTip: string,
  requireShoes: boolean,
): AiOutfit | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const name =
    typeof row.outfit_name === 'string' && row.outfit_name.trim()
      ? row.outfit_name.trim()
      : fallbackName;
  const tip =
    typeof row.styling_tip === 'string' && row.styling_tip.trim()
      ? row.styling_tip.trim()
      : fallbackTip;
  const minItems = requireShoes ? 3 : 2;
  const fromItems = readItems(row.items, minItems);
  const items = fromItems ?? fromSlotCandidate(row, tip, requireShoes);
  if (!items) return null;
  return { outfit_name: name, styling_tip: tip, items };
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

export type GeminiOutfitParseResult =
  | { ok: true; outfits: AiOutfit[]; candidate_count: number }
  | {
      ok: false;
      stage: 'parse' | 'schema' | 'candidate_validation';
      error_type: string;
      candidate_count: number;
    };

/**
 * Distinguishes malformed JSON, missing outfit schema, and candidates that fail slot validation.
 */
export function tryParseGeminiOutfitCandidates(
  content: string,
  options: { requireShoes?: boolean } = {},
): GeminiOutfitParseResult {
  const requireShoes = options.requireShoes !== false;
  let parsed: unknown;
  try {
    parsed = extractJson(content);
  } catch {
    return { ok: false, stage: 'parse', error_type: 'invalid_json', candidate_count: 0 };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, stage: 'schema', error_type: 'not_an_object', candidate_count: 0 };
  }
  const row = parsed as Record<string, unknown>;
  const fallbackName =
    typeof row.outfit_name === 'string' && row.outfit_name.trim()
      ? row.outfit_name.trim()
      : 'Styled Look';
  const fallbackTip =
    typeof row.styling_tip === 'string' && row.styling_tip.trim()
      ? row.styling_tip.trim()
      : 'Wear the pieces together.';

  const hasCandidateArray = Array.isArray(row.candidates);
  const rawList: unknown[] = hasCandidateArray
    ? row.candidates
    : readItems(row.items, requireShoes ? 3 : 2)
      ? [row]
      : [];

  if (!hasCandidateArray && !rawList.length) {
    return { ok: false, stage: 'schema', error_type: 'missing_candidates', candidate_count: 0 };
  }

  const outfits = rawList
    .slice(0, GEMINI_CANDIDATE_LIMIT)
    .map((entry) => toAiOutfit(entry, fallbackName, fallbackTip, requireShoes))
    .filter((outfit): outfit is AiOutfit => outfit !== null);

  if (!outfits.length) {
    return {
      ok: false,
      stage: 'candidate_validation',
      error_type: rawList.length ? 'candidates_invalid' : 'empty_candidates',
      candidate_count: rawList.length,
    };
  }
  return { ok: true, outfits, candidate_count: rawList.length };
}

/**
 * Accepts the multi-candidate Gemini shape or the legacy single-outfit shape.
 * Malformed entries are dropped. Throws only when nothing usable remains.
 */
export function parseGeminiOutfitCandidates(
  content: string,
  options: { requireShoes?: boolean } = {},
): AiOutfit[] {
  const parsed = tryParseGeminiOutfitCandidates(content, options);
  if (!parsed.ok) {
    throw new GeminiGenerationError(parsed.stage, parsed.error_type, {
      message: 'invalid_ai',
      candidate_count: parsed.candidate_count,
    });
  }
  return parsed.outfits;
}

function identicalToExclude(items: AiItem[], excludeIds: Set<string>): boolean {
  return containsExcludedProduct(items, excludeIds);
}

function asDiversityProducts(value: unknown): DiversityProduct[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const product = (row ?? {}) as Record<string, unknown>;
    const visual = product.visual_attributes as DiversityProduct['visual_attributes'];
    return {
      id: typeof product.id === 'string' ? product.id : '',
      name: typeof product.name === 'string' ? product.name : '',
      brand: typeof product.brand === 'string' ? product.brand : null,
      category: typeof product.category === 'string' ? product.category : '',
      subcategory: typeof product.subcategory === 'string' ? product.subcategory : null,
      color: typeof product.color === 'string' ? product.color : null,
      colors: Array.isArray(product.colors)
        ? product.colors.filter((entry): entry is string => typeof entry === 'string')
        : [],
      fit: typeof product.fit === 'string' ? product.fit : null,
      silhouette: typeof product.silhouette === 'string' ? product.silhouette : null,
      visual_attributes: visual ?? null,
    };
  });
}

function fashionTieBreak<T>(
  a: Extract<ScoredOutfitCandidate<T>, { valid: true }>,
  b: Extract<ScoredOutfitCandidate<T>, { valid: true }>,
): number {
  if (b.breakdown.cohesion !== a.breakdown.cohesion) {
    return b.breakdown.cohesion - a.breakdown.cohesion;
  }
  if (b.breakdown.style !== a.breakdown.style) {
    return b.breakdown.style - a.breakdown.style;
  }
  if (b.breakdown.color !== a.breakdown.color) {
    return b.breakdown.color - a.breakdown.color;
  }
  if (b.breakdown.proportion !== a.breakdown.proportion) {
    return b.breakdown.proportion - a.breakdown.proportion;
  }
  return a.index - b.index;
}

export type DiversitySelectOptions<T> = {
  previousOutfit?: PreviousOutfitItem[];
  productsOf?: (built: T) => unknown[];
  footwearPreference?: 'include' | 'none';
};

export function selectBestScoredCandidate<T>(
  candidates: Array<ScoredOutfitCandidate<T>>,
  options?: DiversitySelectOptions<T>,
): Extract<ScoredOutfitCandidate<T>, { valid: true }> | null {
  const valid = candidates.filter(
    (candidate): candidate is Extract<ScoredOutfitCandidate<T>, { valid: true }> =>
      candidate.valid,
  );
  if (!valid.length) return null;

  const previous = options?.previousOutfit ?? [];
  const bestFashion = Math.max(...valid.map((candidate) => candidate.score));
  const pool = previous.length
    ? valid.filter((candidate) => candidate.score >= bestFashion - REBUILD_FASHION_BAND)
    : valid;

  const diversityOf = (candidate: Extract<ScoredOutfitCandidate<T>, { valid: true }>) => {
    if (!previous.length || !options?.productsOf) return 0;
    return outfitDiversityScore(
      asDiversityProducts(options.productsOf(candidate.built)),
      previous,
      options.footwearPreference ?? 'include',
    );
  };

  const ranked = [...pool].sort((a, b) => {
    if (previous.length) {
      const diversityDelta = diversityOf(b) - diversityOf(a);
      if (diversityDelta !== 0) return diversityDelta;
    }
    if (b.score !== a.score) return b.score - a.score;
    return fashionTieBreak(a, b);
  });
  const diverse = keepDiverseScoredCandidates(ranked);
  return diverse[0] ?? ranked[0] ?? null;
}

/**
 * Greedy skip of near-clone candidates after fashion ranking.
 * If filtering would leave nothing, keep the highest-scoring valid candidate.
 */
export function keepDiverseScoredCandidates<T>(
  ranked: Array<Extract<ScoredOutfitCandidate<T>, { valid: true }>>,
): Array<Extract<ScoredOutfitCandidate<T>, { valid: true }>> {
  if (ranked.length <= 1) return ranked;
  const kept: Array<Extract<ScoredOutfitCandidate<T>, { valid: true }>> = [];
  for (const candidate of ranked) {
    const next = { items: candidate.outfit.items };
    if (kept.some((existing) =>
      candidatesShareTooManyProducts([{ items: existing.outfit.items }, next]),
    )) {
      continue;
    }
    kept.push(candidate);
  }
  return kept.length ? kept : ranked.slice(0, 1);
}

export function evaluateOutfitCandidates<TBuilt, TProduct>(params: {
  outfits: AiOutfit[];
  excludeIds: Set<string>;
  validate: (outfit: AiOutfit) => TBuilt;
  productsOf: (built: TBuilt) => TProduct[];
  score: (products: TProduct[]) => OutfitScore;
  previousOutfit?: PreviousOutfitItem[];
  footwearPreference?: 'include' | 'none';
}): {
  count: number;
  candidates: Array<ScoredOutfitCandidate<TBuilt>>;
  winner: Extract<ScoredOutfitCandidate<TBuilt>, { valid: true }> | null;
} {
  const candidates: Array<ScoredOutfitCandidate<TBuilt>> = [];

  for (const [index, outfit] of params.outfits.entries()) {
    if (identicalToExclude(outfit.items, params.excludeIds)) {
      candidates.push({ valid: false, index, reason: 'rebuild_identical' });
      continue;
    }
    try {
      const built = params.validate(outfit);
      const fashion = params.score(params.productsOf(built));
      candidates.push({
        valid: true,
        index,
        score: fashion.score,
        breakdown: fashion.breakdown,
        issues: fashion.issues,
        suggestions: fashion.suggestions,
        fashion,
        outfit,
        built,
      });
    } catch (err) {
      candidates.push({
        valid: false,
        index,
        reason: err instanceof Error ? err.message : 'invalid_ai',
      });
    }
  }

  return {
    count: params.outfits.length,
    candidates,
    winner: selectBestScoredCandidate(candidates, {
      previousOutfit: params.previousOutfit,
      productsOf: params.productsOf,
      footwearPreference: params.footwearPreference,
    }),
  };
}

export function logOutfitCandidates(input: {
  count: number;
  valid_count: number;
  scores: number[];
  selected_score: number | null;
  invalid?: string[];
}): void {
  console.log(
    `[OUTFIT_CANDIDATES] ${JSON.stringify({
      count: input.count,
      valid_count: input.valid_count,
      scores: input.scores,
      selected_score: input.selected_score,
      ...(input.invalid?.length ? { invalid: input.invalid } : {}),
    })}`,
  );
}
