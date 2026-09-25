import type { OutfitScore, OutfitScoreBreakdown } from '../_shared/catalog/outfitScoring.ts';

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

function readItems(value: unknown): AiItem[] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
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

function fromSlotCandidate(raw: Record<string, unknown>, fallbackReason: string): AiItem[] | null {
  const top = readId(raw.top_id);
  const bottom = readId(raw.bottom_id);
  const shoes = readId(raw.shoes_id);
  if (!top || !bottom || !shoes) return null;
  const reason = typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason : fallbackReason;
  const items: AiItem[] = [
    { product_id: top, reason },
    { product_id: bottom, reason },
    { product_id: shoes, reason },
  ];
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
  const fromItems = readItems(row.items);
  const items = fromItems ?? fromSlotCandidate(row, tip);
  if (!items) return null;
  return { outfit_name: name, styling_tip: tip, items };
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

/**
 * Accepts the multi-candidate Gemini shape or the legacy single-outfit shape.
 * Malformed entries are dropped. Throws only when nothing usable remains.
 */
export function parseGeminiOutfitCandidates(content: string): AiOutfit[] {
  let parsed: unknown;
  try {
    parsed = extractJson(content);
  } catch {
    throw new Error('invalid_ai');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('invalid_ai');
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

  const rawList = Array.isArray(row.candidates)
    ? row.candidates
    : readItems(row.items)
      ? [row]
      : [];

  const outfits = rawList
    .slice(0, GEMINI_CANDIDATE_LIMIT)
    .map((entry) => toAiOutfit(entry, fallbackName, fallbackTip))
    .filter((outfit): outfit is AiOutfit => outfit !== null);

  if (!outfits.length) {
    throw new Error('invalid_ai');
  }
  return outfits;
}

function identicalToExclude(items: AiItem[], excludeIds: Set<string>): boolean {
  if (!excludeIds.size) return false;
  const ids = items.map((item) => item.product_id);
  return ids.length === excludeIds.size && ids.every((id) => excludeIds.has(id));
}

export function selectBestScoredCandidate<T>(
  candidates: Array<ScoredOutfitCandidate<T>>,
): Extract<ScoredOutfitCandidate<T>, { valid: true }> | null {
  const valid = candidates.filter(
    (candidate): candidate is Extract<ScoredOutfitCandidate<T>, { valid: true }> =>
      candidate.valid,
  );
  if (!valid.length) return null;

  return [...valid].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
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
  })[0];
}

export function evaluateOutfitCandidates<TBuilt, TProduct>(params: {
  outfits: AiOutfit[];
  excludeIds: Set<string>;
  validate: (outfit: AiOutfit) => TBuilt;
  productsOf: (built: TBuilt) => TProduct[];
  score: (products: TProduct[]) => OutfitScore;
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
    winner: selectBestScoredCandidate(candidates),
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
