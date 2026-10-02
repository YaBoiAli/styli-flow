import type { ProductCategory, ProductGender } from '../types.ts';
import { all, men, women, type QueryConcept } from '../queryConcepts.ts';
import { uiOccasionConceptMap, uiStyleConceptMap } from '../styleOccasionContract.ts';

export type { QueryConcept } from '../queryConcepts.ts';

/**
 * Non-UI retrieval vocab. Not in types/index.ts Style/Occasion.
 * Kept so legacy/internal lookups still resolve. Do not add these to SearchStyle.
 */
const INTERNAL_NON_UI_STYLE_CONCEPTS: Record<string, QueryConcept[]> = {
  'business casual': [
    men('button up shirt', 'top'),
    women('work blouse', 'top'),
    all('chinos', 'bottom'),
    all('loafers', 'shoes'),
    all('casual blazer', 'outerwear'),
  ],
  vintage: [
    all('vintage wash tee', 'top'),
    all('vintage graphic shirt', 'top'),
    all('vintage denim jeans', 'bottom'),
    all('vintage sneakers', 'shoes'),
  ],
  cottagecore: [
    women('floral blouse', 'top'),
    all('linen shirt', 'top'),
    women('prairie skirt', 'bottom'),
    all('suede boots', 'shoes'),
  ],
  goth: [
    all('black fitted shirt', 'top'),
    all('black skinny jeans', 'bottom'),
    all('black boots', 'shoes'),
    all('black leather jacket', 'outerwear'),
  ],
  coquette: [
    women('bow blouse', 'top'),
    women('lace top', 'top'),
    women('mini skirt', 'bottom'),
    women('ballet flats', 'shoes'),
  ],
};

const INTERNAL_NON_UI_OCCASION_CONCEPTS: Record<string, QueryConcept[]> = {
  workout: [
    all('training tee', 'top'),
    all('workout joggers', 'bottom'),
    all('training sneakers', 'shoes'),
  ],
};

export const STYLE_CONCEPTS: Record<string, QueryConcept[]> = {
  ...uiStyleConceptMap(),
  ...INTERNAL_NON_UI_STYLE_CONCEPTS,
};

export const OCCASION_CONCEPTS: Record<string, QueryConcept[]> = {
  ...uiOccasionConceptMap(),
  ...INTERNAL_NON_UI_OCCASION_CONCEPTS,
};

export const CATEGORY_TERMS: Record<ProductCategory, string[]> = {
  top: ['tee', 't-shirt', 'shirt', 'hoodie', 'sweater', 'tank', 'polo', 'button-up', 'blouse', 'knit'],
  bottom: ['jeans', 'pants', 'trousers', 'cargo pants', 'baggy jeans', 'shorts', 'skirt', 'joggers', 'chinos'],
  shoes: ['sneakers', 'boots', 'loafers', 'sandals', 'dress shoes', 'platforms', 'heels'],
  outerwear: ['jacket', 'coat', 'blazer', 'bomber'],
  accessory: ['bag', 'hat', 'belt', 'cap'],
};

export function normalizeIntentKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

/** Phrases that should never be issued for men's retrieval. */
export const WOMEN_ONLY_QUERY = /\b(heels?|baby tee|cropped top|crop top|mini skirt|ballet flats)\b/i;

/** Obvious nightlife mismatches. Channel3 has no exclude filter; Styli applies these after fetch. */
export const NIGHT_OUT_HARD_EXCLUDE =
  /\b(pajama|pyjama|sleepwear|nightwear|sleep shirt|bathrobe|robes?|hunting|fishing)\b/i;

/** Softer nightlife mismatches — rank down, do not hard-drop. */
export const NIGHT_OUT_SOFT_EXCLUDE =
  /\b(western|cowboy|pearl snap|rodeo|workwear|thermal|hiking|trail|outdoor|loungewear|flannel work)\b/i;

export const QUERY_SYNONYMS: Record<string, string[]> = {
  y2k: ['y2k', '2000s', '00s', '2000', 'vintage'],
  oversized: ['oversized', 'oversize', 'relaxed', 'loose', 'baggy', 'boxy'],
  baggy: ['baggy', 'loose', 'relaxed', 'carpenter', 'wide', 'wide leg'],
  tee: ['tee', 't-shirt', 'tshirt', 't shirt'],
  shirt: ['shirt', 'button-up', 'button up', 'button-down'],
  jeans: ['jeans', 'jean', 'denim'],
  hoodie: ['hoodie', 'hooded'],
  sneakers: ['sneakers', 'sneaker', 'trainers', 'kicks'],
  streetwear: ['streetwear', 'street', 'urban', 'baggy', 'loose', 'graphic', 'oversized'],
  party: ['party', 'nightlife', 'club', 'going out', 'evening'],
  nightlife: ['nightlife', 'club', 'party', 'going out', 'evening'],
  fitted: ['fitted', 'slim', 'tailored'],
  satin: ['satin', 'silk', 'sheen'],
  denim: ['denim', 'jeans', 'jean'],
  loose: ['loose', 'baggy', 'relaxed', 'carpenter'],
  carpenter: ['carpenter', 'baggy', 'loose', 'utility'],
};

export const MARKETPLACE_BRANDS = ['walmart', 'amazon', 'target', 'ebay'] as const;

export function isNightOutIntent(style?: string, occasion?: string): boolean {
  return normalizeIntentKey(style) === 'night out' || normalizeIntentKey(occasion) === 'night out';
}

export function conceptAllowed(
  concept: QueryConcept,
  category?: ProductCategory,
  gender?: ProductGender,
): boolean {
  if (category && !concept.categories.includes(category)) return false;
  if (gender === 'men' && WOMEN_ONLY_QUERY.test(concept.phrase)) return false;
  if (!gender || gender === 'unisex' || !concept.genders) return true;
  return concept.genders.includes(gender);
}
