/**
 * Shared fashion maps used by generate-outfit ranking and outfit-level scoring.
 * Keyword/fit/alias values come from styleOccasionContract so retrieval and scoring
 * share one vocabulary. Formulas in outfitScoring.ts are unchanged.
 */
import { attrKey } from './fashionAttributes.ts';
import {
  occasionContractFor,
  occasionKeywordMap,
  scoringKeywordMap,
  styleContractFor,
  styleFitMap,
  styleSilhouetteMap,
} from './styleOccasionContract.ts';

export type SkinTonePreference = 'fair' | 'light' | 'medium' | 'tan' | 'deep' | 'rich';

export const SKIN_TONE_COLORS: Record<SkinTonePreference, { prefer: string[]; avoid: string[] }> = {
  fair: {
    prefer: ['navy', 'burgundy', 'forest', 'emerald', 'charcoal', 'black', 'cobalt', 'wine', 'plum', 'ivory', 'white'],
    avoid: ['beige', 'nude', 'orange', 'peach', 'yellow', 'camel'],
  },
  light: {
    prefer: ['olive', 'camel', 'navy', 'rust', 'cream', 'forest', 'burgundy', 'rose', 'white', 'ivory'],
    avoid: ['neon', 'yellow', 'orange'],
  },
  medium: {
    prefer: ['gold', 'rust', 'olive', 'cream', 'terracotta', 'teal', 'white', 'camel', 'burgundy', 'navy'],
    avoid: ['muddy', 'grey'],
  },
  tan: {
    prefer: ['white', 'cream', 'gold', 'coral', 'olive', 'cobalt', 'emerald', 'ivory', 'navy'],
    avoid: ['brown', 'khaki', 'tan', 'beige'],
  },
  deep: {
    prefer: ['white', 'ivory', 'gold', 'emerald', 'cobalt', 'red', 'royal', 'yellow', 'fuchsia'],
    avoid: ['brown', 'beige', 'khaki', 'olive'],
  },
  rich: {
    prefer: ['white', 'gold', 'emerald', 'cobalt', 'red', 'fuchsia', 'royal', 'cream', 'silver'],
    avoid: ['brown', 'beige', 'khaki', 'tan'],
  },
};

export function parseSkinTone(value: unknown): SkinTonePreference | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return key in SKIN_TONE_COLORS ? (key as SkinTonePreference) : null;
}

/** Map UI styles (including premium) onto catalog style_tags. */
export function styleAliasTags(style: string): string[] {
  const styleTag = style.trim().toLowerCase();
  const aliases = styleContractFor(style)?.tagAliases ?? [];
  return [styleTag, ...aliases];
}

export const STYLE_KEYWORDS: Record<string, string[]> = scoringKeywordMap();

export const OCCASION_KEYWORDS: Record<string, string[]> = occasionKeywordMap();

export function keywordHits(text: string, keywords: string[]): number {
  return keywords.reduce(
    (hits, keyword) => (new RegExp(`\\b${keyword}s?\\b`).test(text) ? hits + 1 : hits),
    0,
  );
}

export const CLASSY_STYLES = new Set([
  'formal',
  'old money',
  'old_money',
  'quiet luxury',
  'quiet_luxury',
  'preppy',
  'dark academia',
  'dark_academia',
  'runway',
]);

export function isClassyLook(style: string, occasion: string): boolean {
  return CLASSY_STYLES.has(attrKey(style)) ||
    CLASSY_STYLES.has(style.trim().toLowerCase()) ||
    Boolean(occasionContractFor(occasion)?.classyFootwear);
}

export const STYLE_FIT: Record<string, string[]> = styleFitMap();

export const STYLE_SILHOUETTE: Record<string, string[]> = styleSilhouetteMap();

const DRESS_SHOE_BRANDS = new Set(['marc nolan']);
const DRESS_SHOE_NAME =
  /\b(loafers?|oxfords?|derbys?|monk straps?|dress shoes?|penny loafers?|mary janes?|bit loafers?)\b/;

export type DressFootwearSignals = {
  category?: string | null;
  name?: string | null;
  brand?: string | null;
  subcategory?: string | null;
  purchase_url?: string | null;
};

/** Same dress-shoe signals as generate-outfit. Quality scoring only — not a hard filter. */
export function looksLikeDressFootwear(product: DressFootwearSignals): boolean {
  if (product.category && product.category !== 'shoes') return false;
  if (DRESS_SHOE_BRANDS.has((product.brand ?? '').trim().toLowerCase())) return true;
  if ((product.purchase_url ?? '').includes('marcnolan.com')) return true;
  const sub = (product.subcategory ?? '').toLowerCase();
  if (sub === 'loafers' || sub === 'heels') return true;
  return DRESS_SHOE_NAME.test((product.name ?? '').toLowerCase());
}
