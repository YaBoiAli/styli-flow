/**
 * Shared fashion maps used by generate-outfit ranking and outfit-level scoring.
 * Keep values here so catalog.ts and outfitScoring.ts do not diverge.
 */
import { attrKey } from './fashionAttributes.ts';

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
  const aliases: Record<string, string[]> = {
    runway: ['formal', 'old money', 'y2k'],
    'quiet luxury': ['old money', 'minimalist'],
    'dark academia': ['preppy', 'grunge', 'formal'],
    'elevated streetwear': ['streetwear', 'athleisure', 'minimalist'],
  };
  return [styleTag, ...(aliases[styleTag] ?? [])];
}

export const STYLE_KEYWORDS: Record<string, string[]> = {
  streetwear: ['hoodie', 'graphic', 'oversized', 'cargo', 'sneaker', 'jogger', 'sweatshirt', 'baggy', 'logo', 'puffer', 'boxy'],
  y2k: ['baby tee', 'crop', 'low rise', 'flare', 'mini', 'rhinestone', 'velour', 'platform', 'metallic', 'baggy', 'butterfly'],
  'old money': ['polo', 'oxford', 'cable', 'cashmere', 'loafer', 'chino', 'blazer', 'linen', 'knit', 'pleated', 'wool', 'quarter zip'],
  old_money: ['polo', 'oxford', 'cable', 'cashmere', 'loafer', 'chino', 'blazer', 'linen', 'knit', 'pleated', 'wool', 'quarter zip'],
  minimalist: ['essential', 'basic', 'crew', 'straight', 'solid', 'relaxed', 'plain', 'white', 'black', 'neutral', 'clean'],
  preppy: ['polo', 'oxford', 'chino', 'cardigan', 'pleated', 'loafer', 'blazer', 'button', 'stripe', 'varsity', 'cable'],
  athleisure: ['jogger', 'legging', 'track', 'tech', 'performance', 'running', 'training', 'zip', 'fleece', 'sneaker', 'active', 'sweat'],
  casual: ['tee', 'jean', 'denim', 'crew', 'hoodie', 'sneaker', 'relaxed', 'short', 'flannel', 'sweatshirt'],
  formal: ['suit', 'blazer', 'dress shirt', 'trouser', 'oxford', 'loafer', 'derby', 'tie', 'wool', 'tailored', 'pleated'],
  'clean girl': ['ribbed', 'tank', 'slip', 'satin', 'bodysuit', 'straight', 'neutral', 'cream', 'white', 'gold', 'knit'],
  clean_girl: ['ribbed', 'tank', 'slip', 'satin', 'bodysuit', 'straight', 'neutral', 'cream', 'white', 'gold', 'knit'],
  grunge: ['flannel', 'plaid', 'distressed', 'ripped', 'black', 'boot', 'band', 'washed', 'oversized', 'leather', 'combat'],
  runway: ['statement', 'leather', 'satin', 'sheer', 'sculpt', 'tailored', 'metallic', 'platform', 'structured', 'oversized'],
  'quiet luxury': ['cashmere', 'merino', 'wool', 'silk', 'linen', 'suede', 'camel', 'knit', 'tailored', 'loafer', 'trouser'],
  quiet_luxury: ['cashmere', 'merino', 'wool', 'silk', 'linen', 'suede', 'camel', 'knit', 'tailored', 'loafer', 'trouser'],
  'dark academia': ['tweed', 'wool', 'cardigan', 'turtleneck', 'trouser', 'oxford', 'loafer', 'brown', 'plaid', 'blazer', 'corduroy'],
  dark_academia: ['tweed', 'wool', 'cardigan', 'turtleneck', 'trouser', 'oxford', 'loafer', 'brown', 'plaid', 'blazer', 'corduroy'],
  'elevated streetwear': ['premium', 'heavyweight', 'relaxed', 'suede', 'leather', 'cargo', 'overshirt', 'knit', 'sneaker', 'bomber', 'wide leg'],
  elevated_streetwear: ['premium', 'heavyweight', 'relaxed', 'suede', 'leather', 'cargo', 'overshirt', 'knit', 'sneaker', 'bomber', 'wide leg'],
};

export const OCCASION_KEYWORDS: Record<string, string[]> = {
  everyday: ['tee', 'jean', 'sneaker', 'hoodie', 'relaxed', 'crew'],
  date: ['button', 'knit', 'fitted', 'satin', 'chelsea', 'polo', 'slim'],
  party: ['satin', 'metallic', 'sequin', 'statement', 'black', 'leather'],
  school: ['hoodie', 'jean', 'sneaker', 'backpack', 'crew', 'cardigan', 'sweatshirt'],
  work: ['button', 'chino', 'trouser', 'oxford', 'loafer', 'blazer', 'polo'],
  vacation: ['linen', 'short', 'sandal', 'camp', 'tank', 'lightweight', 'resort'],
  event: ['blazer', 'suit', 'tailored', 'loafer', 'oxford', 'dress'],
  'night out': ['black', 'leather', 'satin', 'boot', 'fitted', 'jacket'],
  night_out: ['black', 'leather', 'satin', 'boot', 'fitted', 'jacket'],
};

export function keywordHits(text: string, keywords: string[]): number {
  return keywords.reduce(
    (hits, keyword) => (new RegExp(`\\b${keyword}s?\\b`).test(text) ? hits + 1 : hits),
    0,
  );
}

export const CLASSY_OCCASIONS = new Set([
  'date',
  'event',
  'work',
  'night_out',
  'night out',
  'party',
]);

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
    CLASSY_OCCASIONS.has(attrKey(occasion)) ||
    CLASSY_OCCASIONS.has(occasion.trim().toLowerCase());
}

export const STYLE_FIT: Record<string, string[]> = {
  streetwear: ['relaxed', 'oversized', 'loose'],
  y2k: ['fitted', 'slim', 'oversized'],
  'old money': ['regular', 'slim', 'fitted'],
  old_money: ['regular', 'slim', 'fitted'],
  minimalist: ['regular', 'relaxed', 'slim'],
  preppy: ['regular', 'fitted'],
  athleisure: ['relaxed', 'fitted'],
  formal: ['slim', 'fitted', 'regular'],
  grunge: ['oversized', 'relaxed', 'loose'],
  'quiet luxury': ['regular', 'slim', 'fitted'],
  quiet_luxury: ['regular', 'slim', 'fitted'],
};

export const STYLE_SILHOUETTE: Record<string, string[]> = {
  streetwear: ['baggy', 'boxy', 'oversized', 'wide_leg'],
  y2k: ['cropped', 'baggy', 'low_rise', 'bodycon'],
  'old money': ['straight', 'regular', 'slim'],
  old_money: ['straight', 'regular', 'slim'],
  minimalist: ['straight', 'regular', 'boxy'],
  preppy: ['straight', 'regular'],
  formal: ['straight', 'slim', 'regular'],
  grunge: ['oversized', 'baggy', 'straight'],
};

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
