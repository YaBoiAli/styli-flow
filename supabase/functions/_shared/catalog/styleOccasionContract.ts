/**
 * Canonical UI style/occasion contract.
 * Keyed by types/index.ts Style and Occasion labels.
 * Retrieval, scoring maps, and later Gemini/critic copy should read from here.
 * scoreOutfit formulas are not switched in this phase — fashionSignals re-exports
 * the same keyword/fit/alias values so scoring stays numerically identical.
 */
import { OCCASIONS, STYLES, type Occasion, type Style } from '../../../../types/index.ts';
import type { FormalityAttr } from './fashionAttributes.ts';
import { all, men, women, type QueryConcept } from './queryConcepts.ts';

export const RESERVED_OCCASION_QUERY_SLOTS = 2;
export const MAX_STYLE_QUERY_CONCEPTS = 5;

export type StyleContract = {
  key: string;
  label: Style;
  retrievalConcepts: QueryConcept[];
  scoringKeywords: string[];
  tagAliases: string[];
  fitPriors: string[];
  silhouettePriors: string[];
  volumeFriendly: boolean;
  intensityFriendly: boolean;
  geminiInterpretation: string;
  criticInterpretation: string;
};

export type OccasionContract = {
  key: string;
  label: Occasion;
  aliases: string[];
  retrievalConcepts: QueryConcept[];
  scoringKeywords: string[];
  acceptedFormality: FormalityAttr[];
  classyFootwear: boolean;
  geminiRules: string;
  reservedQuerySlots: number;
};

export const STYLE_CONTRACT: Record<Style, StyleContract> = {
  Streetwear: {
    key: 'streetwear',
    label: 'Streetwear',
    retrievalConcepts: [
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
    scoringKeywords: ['hoodie', 'graphic', 'oversized', 'cargo', 'sneaker', 'jogger', 'sweatshirt', 'baggy', 'logo', 'puffer', 'boxy'],
    tagAliases: [],
    fitPriors: ['relaxed', 'oversized', 'loose'],
    silhouettePriors: ['baggy', 'boxy', 'oversized', 'wide_leg'],
    volumeFriendly: true,
    intensityFriendly: true,
    geminiInterpretation: 'Baggy, bold, urban streetwear. Multiple valid compositions — not only oversized dark hoodie looks.',
    criticInterpretation: 'Judge as streetwear, not generic casual. Graphic, cargo, sneaker language is in-family; tailored prep is not.',
  },
  Y2K: {
    key: 'y2k',
    label: 'Y2K',
    retrievalConcepts: [
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
    scoringKeywords: ['baby tee', 'crop', 'low rise', 'flare', 'mini', 'rhinestone', 'velour', 'platform', 'metallic', 'baggy', 'butterfly'],
    tagAliases: [],
    fitPriors: ['fitted', 'slim', 'oversized'],
    silhouettePriors: ['cropped', 'baggy', 'low_rise', 'bodycon'],
    volumeFriendly: true,
    intensityFriendly: true,
    geminiInterpretation: 'Nostalgic, playful, shiny 2000s. Baby tees, metallic, low-rise, platforms — not a streetwear hoodie default.',
    criticInterpretation: 'Y2K should read playful/shiny or distinctly 2000s. A generic zip hoodie and baggy jean is weak Y2K.',
  },
  'Old Money': {
    key: 'old money',
    label: 'Old Money',
    retrievalConcepts: [
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
    scoringKeywords: ['polo', 'oxford', 'cable', 'cashmere', 'loafer', 'chino', 'blazer', 'linen', 'knit', 'pleated', 'wool', 'quarter zip'],
    tagAliases: [],
    fitPriors: ['regular', 'slim', 'fitted'],
    silhouettePriors: ['straight', 'regular', 'slim'],
    volumeFriendly: false,
    intensityFriendly: false,
    geminiInterpretation: 'Quiet, refined, classic. Oxfords, polos, cashmere, loafers, tailored trousers.',
    criticInterpretation: 'Old money is polished heritage, not streetwear and not costume formalwear.',
  },
  Minimalist: {
    key: 'minimalist',
    label: 'Minimalist',
    retrievalConcepts: [
      all('minimalist crew tee', 'top'),
      all('plain heavyweight tee', 'top'),
      all('clean knit sweater', 'top'),
      all('straight leg jeans', 'bottom'),
      all('minimalist sneakers', 'shoes'),
      all('unstructured blazer', 'outerwear'),
    ],
    scoringKeywords: ['essential', 'basic', 'crew', 'straight', 'solid', 'relaxed', 'plain', 'white', 'black', 'neutral', 'clean'],
    tagAliases: [],
    fitPriors: ['regular', 'relaxed', 'slim'],
    silhouettePriors: ['straight', 'regular', 'boxy'],
    volumeFriendly: false,
    intensityFriendly: false,
    geminiInterpretation: 'Clean, calm, essential. Plain cuts, restrained color, no loud graphics.',
    criticInterpretation: 'Minimalist fails when pieces are logo-heavy, baggy-street, or overly ornate.',
  },
  Preppy: {
    key: 'preppy',
    label: 'Preppy',
    retrievalConcepts: [
      all('polo shirt', 'top'),
      men('oxford button down', 'top'),
      all('cable knit sweater', 'top'),
      all('chinos', 'bottom'),
      all('loafers', 'shoes'),
    ],
    scoringKeywords: ['polo', 'oxford', 'chino', 'cardigan', 'pleated', 'loafer', 'blazer', 'button', 'stripe', 'varsity', 'cable'],
    tagAliases: [],
    fitPriors: ['regular', 'fitted'],
    silhouettePriors: ['straight', 'regular'],
    volumeFriendly: false,
    intensityFriendly: false,
    geminiInterpretation: 'Polished, collegiate. Polos, oxfords, cable knits, chinos, loafers.',
    criticInterpretation: 'Preppy is collegiate polish, not baggy streetwear or full black-tie.',
  },
  Athleisure: {
    key: 'athleisure',
    label: 'Athleisure',
    retrievalConcepts: [
      all('performance hoodie', 'top'),
      all('training tee', 'top'),
      all('joggers', 'bottom'),
      all('running sneakers', 'shoes'),
      all('track jacket', 'outerwear'),
    ],
    scoringKeywords: ['jogger', 'legging', 'track', 'tech', 'performance', 'running', 'training', 'zip', 'fleece', 'sneaker', 'active', 'sweat'],
    tagAliases: [],
    fitPriors: ['relaxed', 'fitted'],
    silhouettePriors: [],
    volumeFriendly: false,
    intensityFriendly: false,
    geminiInterpretation: 'Sporty, soft, mobile. Performance knits, joggers, trainers — wearable, not gym-only.',
    criticInterpretation: 'Athleisure should look athletic-casual. Dress shoes and baggy denim are off.',
  },
  Casual: {
    key: 'casual',
    label: 'Casual',
    retrievalConcepts: [
      all('casual crew tee', 'top'),
      all('casual hoodie', 'top'),
      all('everyday shirt', 'top'),
      all('casual jeans', 'bottom'),
      all('casual sneakers', 'shoes'),
    ],
    scoringKeywords: ['tee', 'jean', 'denim', 'crew', 'hoodie', 'sneaker', 'relaxed', 'short', 'flannel', 'sweatshirt'],
    tagAliases: [],
    fitPriors: [],
    silhouettePriors: [],
    volumeFriendly: false,
    intensityFriendly: false,
    geminiInterpretation: 'Easy, lived-in. Tees, jeans, sneakers, unforced layering.',
    criticInterpretation: 'Casual should look everyday-wearable, not costume and not office-formal.',
  },
  Formal: {
    key: 'formal',
    label: 'Formal',
    retrievalConcepts: [
      men('dress shirt', 'top'),
      women('formal blouse', 'top'),
      all('tailored trousers', 'bottom'),
      men('dress shoes', 'shoes'),
      women('dress heels', 'shoes'),
      all('suit jacket', 'outerwear'),
    ],
    scoringKeywords: ['suit', 'blazer', 'dress shirt', 'trouser', 'oxford', 'loafer', 'derby', 'tie', 'wool', 'tailored', 'pleated'],
    tagAliases: [],
    fitPriors: ['slim', 'fitted', 'regular'],
    silhouettePriors: ['straight', 'slim', 'regular'],
    volumeFriendly: false,
    intensityFriendly: false,
    geminiInterpretation: 'Sharp, elevated. Dress shirts, tailored trousers, dress shoes, suit jackets.',
    criticInterpretation: 'Formal fails with hoodies, sneakers, or athletic pieces.',
  },
  'Clean Girl': {
    key: 'clean girl',
    label: 'Clean Girl',
    retrievalConcepts: [
      all('ribbed tank', 'top'),
      all('neutral knit top', 'top'),
      all('straight jeans', 'bottom'),
      all('clean sneakers', 'shoes'),
    ],
    scoringKeywords: ['ribbed', 'tank', 'slip', 'satin', 'bodysuit', 'straight', 'neutral', 'cream', 'white', 'gold', 'knit'],
    tagAliases: [],
    fitPriors: [],
    silhouettePriors: [],
    volumeFriendly: false,
    intensityFriendly: false,
    geminiInterpretation: 'Fresh, soft, sleek. Ribbed tanks, straight denim, cream/white neutrals.',
    criticInterpretation: 'Clean girl is sleek and understated, not baggy street or shiny party.',
  },
  Grunge: {
    key: 'grunge',
    label: 'Grunge',
    retrievalConcepts: [
      all('flannel shirt', 'top'),
      all('oversized band tee', 'top'),
      all('ripped jeans', 'bottom'),
      all('combat boots', 'shoes'),
      all('leather jacket', 'outerwear'),
    ],
    scoringKeywords: ['flannel', 'plaid', 'distressed', 'ripped', 'black', 'boot', 'band', 'washed', 'oversized', 'leather', 'combat'],
    tagAliases: [],
    fitPriors: ['oversized', 'relaxed', 'loose'],
    silhouettePriors: ['oversized', 'baggy', 'straight'],
    volumeFriendly: true,
    intensityFriendly: true,
    geminiInterpretation: 'Raw, dark, textured. Flannel, band tees, ripped denim, combat boots.',
    criticInterpretation: 'Grunge is worn-in and dark, not preppy or quiet-luxury polish.',
  },
  Runway: {
    key: 'runway',
    label: 'Runway',
    retrievalConcepts: [
      all('statement shirt', 'top'),
      all('sculpted top', 'top'),
      all('tailored wide pants', 'bottom'),
      all('platform sneakers', 'shoes'),
      all('structured jacket', 'outerwear'),
    ],
    scoringKeywords: ['statement', 'leather', 'satin', 'sheer', 'sculpt', 'tailored', 'metallic', 'platform', 'structured', 'oversized'],
    tagAliases: ['formal', 'old money', 'y2k'],
    fitPriors: [],
    silhouettePriors: [],
    volumeFriendly: true,
    intensityFriendly: true,
    geminiInterpretation: 'Editorial, dramatic. Statement shapes, sculpted tops, structured jackets.',
    criticInterpretation: 'Runway should look intentional and editorial, not a default hoodie set.',
  },
  'Quiet Luxury': {
    key: 'quiet luxury',
    label: 'Quiet Luxury',
    retrievalConcepts: [
      all('camel cashmere sweater', 'top'),
      all('merino knit sweater', 'top'),
      women('silk knit top', 'top'),
      men('quiet luxury knit polo', 'top'),
      all('tailored wool trousers', 'bottom'),
      all('cashmere knit trousers', 'bottom'),
      all('suede loafers', 'shoes'),
      all('leather loafers', 'shoes'),
      all('cashmere overcoat', 'outerwear'),
    ],
    scoringKeywords: ['cashmere', 'merino', 'wool', 'silk', 'linen', 'suede', 'camel', 'knit', 'tailored', 'loafer', 'trouser'],
    tagAliases: ['old money', 'minimalist'],
    fitPriors: ['regular', 'slim', 'fitted'],
    silhouettePriors: [],
    volumeFriendly: false,
    intensityFriendly: false,
    geminiInterpretation: 'Soft power neutrals. Cashmere, merino, tailored wool, suede loafers — understated, not logo streetwear.',
    criticInterpretation: 'Quiet luxury is expensive-looking restraint. Hoodies, cargos, and skate sneakers are off.',
  },
  'Dark Academia': {
    key: 'dark academia',
    label: 'Dark Academia',
    retrievalConcepts: [
      all('turtleneck sweater', 'top'),
      all('wool cardigan', 'top'),
      men('oxford shirt', 'top'),
      women('dark academia blouse', 'top'),
      all('corduroy trousers', 'bottom'),
      all('wool trousers', 'bottom'),
      all('leather oxfords', 'shoes'),
      all('leather loafers', 'shoes'),
      all('tweed blazer', 'outerwear'),
    ],
    scoringKeywords: ['tweed', 'wool', 'cardigan', 'turtleneck', 'trouser', 'oxford', 'loafer', 'brown', 'plaid', 'blazer', 'corduroy'],
    tagAliases: ['preppy', 'grunge', 'formal'],
    fitPriors: [],
    silhouettePriors: [],
    volumeFriendly: false,
    intensityFriendly: false,
    geminiInterpretation: 'Scholarly, moody layers. Turtlenecks, tweed, corduroy, oxfords — not distressed grunge.',
    criticInterpretation: 'Dark academia is bookish wool and layers. Combat boots and ripped denim are the wrong family.',
  },
  'Elevated Streetwear': {
    key: 'elevated streetwear',
    label: 'Elevated Streetwear',
    retrievalConcepts: [
      all('premium heavyweight tee', 'top'),
      all('relaxed overshirt', 'top'),
      all('elevated knit polo', 'top'),
      all('wide leg trousers', 'bottom'),
      all('relaxed cargo pants', 'bottom'),
      all('leather sneakers', 'shoes'),
      all('suede sneakers', 'shoes'),
      all('wool bomber jacket', 'outerwear'),
    ],
    scoringKeywords: ['premium', 'heavyweight', 'relaxed', 'suede', 'leather', 'cargo', 'overshirt', 'knit', 'sneaker', 'bomber', 'wide leg'],
    tagAliases: ['streetwear', 'athleisure', 'minimalist'],
    fitPriors: [],
    silhouettePriors: [],
    volumeFriendly: true,
    intensityFriendly: true,
    geminiInterpretation: 'Polished urban edge. Heavyweight tees, overshirts, wide-leg trousers, leather sneakers — not a basic oversized hoodie dump.',
    criticInterpretation: 'Elevated streetwear should look considered. Cheap graphic hoodies and skate defaults are too generic.',
  },
};

export const OCCASION_CONTRACT: Record<Occasion, OccasionContract> = {
  Everyday: {
    key: 'everyday',
    label: 'Everyday',
    aliases: [],
    retrievalConcepts: [
      all('everyday tee', 'top'),
      all('everyday jeans', 'bottom'),
      all('everyday sneakers', 'shoes'),
    ],
    scoringKeywords: ['tee', 'jean', 'sneaker', 'hoodie', 'relaxed', 'crew'],
    acceptedFormality: ['casual', 'athletic', 'smart_casual'],
    classyFootwear: false,
    geminiRules: 'Keep the look wearable for ordinary days. Do not overdress.',
    reservedQuerySlots: RESERVED_OCCASION_QUERY_SLOTS,
  },
  Date: {
    key: 'date',
    label: 'Date',
    aliases: [],
    retrievalConcepts: [
      all('date night shirt', 'top'),
      women('date night top', 'top'),
      all('slim jeans', 'bottom'),
      all('chelsea boots', 'shoes'),
    ],
    scoringKeywords: ['button', 'knit', 'fitted', 'satin', 'chelsea', 'polo', 'slim'],
    acceptedFormality: ['smart_casual', 'casual'],
    classyFootwear: true,
    geminiRules: 'Date looks should feel intentional and a step above everyday, without full formalwear unless the style is formal.',
    reservedQuerySlots: RESERVED_OCCASION_QUERY_SLOTS,
  },
  Party: {
    key: 'party',
    label: 'Party',
    aliases: [],
    retrievalConcepts: [
      all('party shirt', 'top'),
      women('party top', 'top'),
      all('statement top', 'top'),
      all('party trousers', 'bottom'),
      all('party shoes', 'shoes'),
    ],
    scoringKeywords: ['satin', 'metallic', 'sequin', 'statement', 'black', 'leather'],
    acceptedFormality: ['smart_casual', 'casual'],
    classyFootwear: true,
    geminiRules: 'Party should read as going out, not a generic hoodie everyday set.',
    reservedQuerySlots: RESERVED_OCCASION_QUERY_SLOTS,
  },
  School: {
    key: 'school',
    label: 'School',
    aliases: [],
    retrievalConcepts: [
      all('school hoodie', 'top'),
      all('school jeans', 'bottom'),
      all('school sneakers', 'shoes'),
    ],
    scoringKeywords: ['hoodie', 'jean', 'sneaker', 'backpack', 'crew', 'cardigan', 'sweatshirt'],
    acceptedFormality: ['casual', 'athletic', 'smart_casual'],
    classyFootwear: false,
    geminiRules: 'School looks stay practical and campus-wearable.',
    reservedQuerySlots: RESERVED_OCCASION_QUERY_SLOTS,
  },
  Work: {
    key: 'work',
    label: 'Work',
    aliases: [],
    retrievalConcepts: [
      men('work shirt', 'top'),
      women('work blouse', 'top'),
      all('work trousers', 'bottom'),
      all('loafers', 'shoes'),
    ],
    scoringKeywords: ['button', 'chino', 'trouser', 'oxford', 'loafer', 'blazer', 'polo'],
    acceptedFormality: ['smart_casual', 'formal'],
    classyFootwear: true,
    geminiRules: 'Work should look office-appropriate for the requested style. Do not default to gym or skate pieces.',
    reservedQuerySlots: RESERVED_OCCASION_QUERY_SLOTS,
  },
  Vacation: {
    key: 'vacation',
    label: 'Vacation',
    aliases: [],
    retrievalConcepts: [
      all('linen vacation shirt', 'top'),
      all('vacation shorts', 'bottom'),
      all('sandals', 'shoes'),
    ],
    scoringKeywords: ['linen', 'short', 'sandal', 'camp', 'tank', 'lightweight', 'resort'],
    acceptedFormality: ['casual', 'athletic'],
    classyFootwear: false,
    geminiRules: 'Vacation is lighter and more relaxed: linen, shorts, sandals where the style allows.',
    reservedQuerySlots: RESERVED_OCCASION_QUERY_SLOTS,
  },
  Event: {
    key: 'event',
    label: 'Event',
    aliases: ['formal event'],
    retrievalConcepts: [
      men('formal dress shirt', 'top'),
      women('event blouse', 'top'),
      all('formal trousers', 'bottom'),
      men('dress shoes', 'shoes'),
    ],
    scoringKeywords: ['blazer', 'suit', 'tailored', 'loafer', 'oxford', 'dress'],
    acceptedFormality: ['smart_casual', 'formal'],
    classyFootwear: true,
    geminiRules: 'Event is a dressed occasion. Prefer tailored pieces over everyday hoodies and sneakers.',
    reservedQuerySlots: RESERVED_OCCASION_QUERY_SLOTS,
  },
  'Night Out': {
    key: 'night out',
    label: 'Night Out',
    aliases: ['night_out'],
    retrievalConcepts: [
      men('fitted going out shirt', 'top'),
      men('party camp collar shirt', 'top'),
      women('going out top', 'top'),
      women('satin party top', 'top'),
      all('nightlife dress shirt', 'top'),
      all('elevated casual shirt', 'top'),
      all('nightlife trousers', 'bottom'),
      all('elevated jeans', 'bottom'),
      all('nightlife boots', 'shoes'),
    ],
    scoringKeywords: ['black', 'leather', 'satin', 'boot', 'fitted', 'jacket'],
    acceptedFormality: ['smart_casual', 'casual'],
    classyFootwear: true,
    geminiRules: 'Night out is going-out dressing, not sleepwear and not a daytime hoodie set.',
    reservedQuerySlots: RESERVED_OCCASION_QUERY_SLOTS,
  },
};

const STYLE_BY_KEY = new Map<string, StyleContract>(
  STYLES.map((label) => {
    const record = STYLE_CONTRACT[label];
    return [record.key, record] as const;
  }),
);

const OCCASION_BY_KEY = new Map<string, OccasionContract>();
for (const label of OCCASIONS) {
  const record = OCCASION_CONTRACT[label];
  OCCASION_BY_KEY.set(record.key, record);
  for (const alias of record.aliases) {
    OCCASION_BY_KEY.set(alias.replace(/[_-]+/g, ' '), record);
  }
}

export function normalizeContractKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

export function styleContractFor(style?: string): StyleContract | null {
  const key = normalizeContractKey(style);
  if (!key) return null;
  return STYLE_BY_KEY.get(key) ?? null;
}

export function occasionContractFor(occasion?: string): OccasionContract | null {
  const key = normalizeContractKey(occasion);
  if (!key) return null;
  return OCCASION_BY_KEY.get(key) ?? null;
}

export function styleRetrievalConcepts(style?: string): QueryConcept[] {
  return styleContractFor(style)?.retrievalConcepts ?? [];
}

export function occasionRetrievalConcepts(occasion?: string): QueryConcept[] {
  return occasionContractFor(occasion)?.retrievalConcepts ?? [];
}

export function reservedOccasionQuerySlots(occasion?: string): number {
  return occasionContractFor(occasion)?.reservedQuerySlots ?? RESERVED_OCCASION_QUERY_SLOTS;
}

export function uiStyleConceptMap(): Record<string, QueryConcept[]> {
  const map: Record<string, QueryConcept[]> = {};
  for (const label of STYLES) {
    map[STYLE_CONTRACT[label].key] = STYLE_CONTRACT[label].retrievalConcepts;
  }
  return map;
}

export function uiOccasionConceptMap(): Record<string, QueryConcept[]> {
  const map: Record<string, QueryConcept[]> = {};
  for (const label of OCCASIONS) {
    const record = OCCASION_CONTRACT[label];
    map[record.key] = record.retrievalConcepts;
    for (const alias of record.aliases) {
      map[normalizeContractKey(alias)] = record.retrievalConcepts;
    }
  }
  return map;
}

export function scoringKeywordMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const label of STYLES) {
    const record = STYLE_CONTRACT[label];
    map[record.key] = record.scoringKeywords;
    map[record.key.replace(/ /g, '_')] = record.scoringKeywords;
  }
  return map;
}

export function occasionKeywordMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const label of OCCASIONS) {
    const record = OCCASION_CONTRACT[label];
    map[record.key] = record.scoringKeywords;
    map[record.key.replace(/ /g, '_')] = record.scoringKeywords;
  }
  return map;
}

export function styleFitMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const label of STYLES) {
    const record = STYLE_CONTRACT[label];
    if (!record.fitPriors.length) continue;
    map[record.key] = record.fitPriors;
    map[record.key.replace(/ /g, '_')] = record.fitPriors;
  }
  return map;
}

export function styleSilhouetteMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const label of STYLES) {
    const record = STYLE_CONTRACT[label];
    if (!record.silhouettePriors.length) continue;
    map[record.key] = record.silhouettePriors;
    map[record.key.replace(/ /g, '_')] = record.silhouettePriors;
  }
  return map;
}

export function styleTagAliasMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const label of STYLES) {
    const record = STYLE_CONTRACT[label];
    if (!record.tagAliases.length) continue;
    map[record.key] = record.tagAliases;
  }
  return map;
}
