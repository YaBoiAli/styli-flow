import type { ProductCategory, ProductGender } from '../types.ts';

export type QueryConcept = {
  phrase: string;
  categories: ProductCategory[];
  genders?: ProductGender[];
};

function all(phrase: string, ...categories: ProductCategory[]): QueryConcept {
  return { phrase, categories };
}

function men(phrase: string, ...categories: ProductCategory[]): QueryConcept {
  return { phrase, categories, genders: ['men'] };
}

function women(phrase: string, ...categories: ProductCategory[]): QueryConcept {
  return { phrase, categories, genders: ['women'] };
}

export const STYLE_CONCEPTS: Record<string, QueryConcept[]> = {
  y2k: [
    all('Y2K 2000s graphic tee', 'top'),
    all('Y2K oversized tee', 'top'),
    all('Y2K vintage wash tee', 'top'),
    all('Y2K zip hoodie', 'top'),
    all('Y2K graphic shirt', 'top'),
    women('Y2K baby tee', 'top'),
    women('Y2K cropped top', 'top'),
    all('Y2K baggy jeans', 'bottom'),
    women('Y2K low rise jeans', 'bottom'),
    all('Y2K cargo pants', 'bottom'),
    all('Y2K skate sneakers', 'shoes'),
    men('Y2K chunky sneakers', 'shoes'),
    all('Y2K platform sneakers', 'shoes'),
    women('Y2K platform heels', 'shoes'),
    women('Y2K platform shoes', 'shoes'),
    all('Y2K zip hoodie jacket', 'outerwear'),
    all('Y2K shoulder bag', 'accessory'),
  ],
  streetwear: [
    all('streetwear oversized hoodie', 'top'),
    all('streetwear graphic tee', 'top'),
    all('streetwear heavyweight tee', 'top'),
    all('streetwear oversized tee', 'top'),
    all('streetwear zip hoodie', 'top'),
    all('streetwear boxy tee', 'top'),
    all('streetwear relaxed fit shirt', 'top'),
    all('streetwear baggy jeans', 'bottom'),
    all('streetwear cargo pants', 'bottom'),
    all('streetwear joggers', 'bottom'),
    all('streetwear sneakers', 'shoes'),
    all('chunky sneakers streetwear', 'shoes'),
    all('streetwear bomber jacket', 'outerwear'),
    all('streetwear cap', 'accessory'),
  ],
  'night out': [
    men('fitted going out shirt', 'top'),
    men('nightlife dress shirt', 'top'),
    men('party camp collar shirt', 'top'),
    men('evening knit polo', 'top'),
    men('satin club shirt', 'top'),
    men('cuban collar party shirt', 'top'),
    men('statement dinner shirt', 'top'),
    all('elevated casual shirt', 'top'),
    women('going out top', 'top'),
    women('satin party top', 'top'),
    women('nightlife top', 'top'),
    women('date night top', 'top'),
    women('statement going out top', 'top'),
    all('fitted black shirt', 'top'),
    all('dark slim jeans', 'bottom'),
    women('going out mini skirt', 'bottom'),
    men('leather sneakers', 'shoes'),
    women('going out heels', 'shoes'),
    all('night out boots', 'shoes'),
    all('leather jacket', 'outerwear'),
  ],
  'old money': [
    men('oxford shirt', 'top'),
    men('cashmere sweater', 'top'),
    men('polo shirt', 'top'),
    women('silk blouse', 'top'),
    women('cashmere knit top', 'top'),
    all('tailored trousers', 'bottom'),
    all('chinos', 'bottom'),
    all('leather loafers', 'shoes'),
    all('wool blazer', 'outerwear'),
  ],
  minimalist: [
    all('minimalist crew tee', 'top'),
    all('plain heavyweight tee', 'top'),
    all('clean knit sweater', 'top'),
    all('straight leg jeans', 'bottom'),
    all('minimalist sneakers', 'shoes'),
    all('unstructured blazer', 'outerwear'),
  ],
  casual: [
    all('casual crew tee', 'top'),
    all('casual hoodie', 'top'),
    all('everyday shirt', 'top'),
    all('casual jeans', 'bottom'),
    all('casual sneakers', 'shoes'),
  ],
  athleisure: [
    all('performance hoodie', 'top'),
    all('training tee', 'top'),
    all('joggers', 'bottom'),
    all('running sneakers', 'shoes'),
    all('track jacket', 'outerwear'),
  ],
  grunge: [
    all('flannel shirt', 'top'),
    all('oversized band tee', 'top'),
    all('ripped jeans', 'bottom'),
    all('combat boots', 'shoes'),
    all('leather jacket', 'outerwear'),
  ],
  preppy: [
    all('polo shirt', 'top'),
    men('oxford button down', 'top'),
    all('cable knit sweater', 'top'),
    all('chinos', 'bottom'),
    all('loafers', 'shoes'),
  ],
  formal: [
    men('dress shirt', 'top'),
    women('formal blouse', 'top'),
    all('tailored trousers', 'bottom'),
    men('dress shoes', 'shoes'),
    women('dress heels', 'shoes'),
    all('suit jacket', 'outerwear'),
  ],
  'business casual': [
    men('button up shirt', 'top'),
    women('work blouse', 'top'),
    all('chinos', 'bottom'),
    all('loafers', 'shoes'),
    all('casual blazer', 'outerwear'),
  ],
  runway: [
    all('statement shirt', 'top'),
    all('sculpted top', 'top'),
    all('tailored wide pants', 'bottom'),
    all('platform sneakers', 'shoes'),
    all('structured jacket', 'outerwear'),
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
  'clean girl': [
    all('ribbed tank', 'top'),
    all('neutral knit top', 'top'),
    all('straight jeans', 'bottom'),
    all('clean sneakers', 'shoes'),
  ],
};

export const OCCASION_CONCEPTS: Record<string, QueryConcept[]> = {
  everyday: [
    all('everyday tee', 'top'),
    all('everyday jeans', 'bottom'),
    all('everyday sneakers', 'shoes'),
  ],
  'night out': [
    men('fitted going out shirt', 'top'),
    men('party camp collar shirt', 'top'),
    women('going out top', 'top'),
    women('satin party top', 'top'),
    all('nightlife dress shirt', 'top'),
    all('elevated casual shirt', 'top'),
  ],
  date: [
    all('date night shirt', 'top'),
    women('date night top', 'top'),
    all('slim jeans', 'bottom'),
    all('chelsea boots', 'shoes'),
  ],
  work: [
    men('work shirt', 'top'),
    women('work blouse', 'top'),
    all('work trousers', 'bottom'),
    all('loafers', 'shoes'),
  ],
  school: [
    all('school hoodie', 'top'),
    all('school jeans', 'bottom'),
    all('school sneakers', 'shoes'),
  ],
  'formal event': [
    men('formal dress shirt', 'top'),
    women('event blouse', 'top'),
    all('formal trousers', 'bottom'),
    men('dress shoes', 'shoes'),
  ],
  party: [
    all('party shirt', 'top'),
    women('party top', 'top'),
    all('statement top', 'top'),
  ],
  vacation: [
    all('linen vacation shirt', 'top'),
    all('vacation shorts', 'bottom'),
    all('sandals', 'shoes'),
  ],
  workout: [
    all('training tee', 'top'),
    all('workout joggers', 'bottom'),
    all('training sneakers', 'shoes'),
  ],
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
