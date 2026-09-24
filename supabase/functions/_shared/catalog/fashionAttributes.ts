/** Bump this when the classify schema changes so due products are re-enriched. */
export const ENRICHMENT_VERSION = 1;

export const GENDERS = ['men', 'women', 'unisex', 'unknown'] as const;
export const FITS = ['slim', 'regular', 'relaxed', 'oversized', 'fitted', 'loose', 'unknown'] as const;
export const SILHOUETTES = [
  'skinny',
  'straight',
  'wide_leg',
  'baggy',
  'cropped',
  'boxy',
  'a_line',
  'bodycon',
  'oversized',
  'regular',
  'unknown',
] as const;
export const FORMALITIES = ['casual', 'smart_casual', 'formal', 'athletic', 'unknown'] as const;
export const STYLES = [
  'streetwear',
  'y2k',
  'old_money',
  'minimalist',
  'preppy',
  'athleisure',
  'casual',
  'formal',
  'clean_girl',
  'grunge',
  'runway',
  'quiet_luxury',
  'dark_academia',
  'elevated_streetwear',
  'unknown',
] as const;
export const AESTHETICS = [
  'streetwear',
  'y2k',
  'old_money',
  'minimalist',
  'preppy',
  'clean_girl',
  'grunge',
  'quiet_luxury',
  'dark_academia',
  'vintage',
  'sporty',
  'romantic',
  'edgy',
  'classic',
  'coastal',
  'unknown',
] as const;
export const OCCASIONS = [
  'everyday',
  'date',
  'party',
  'school',
  'work',
  'vacation',
  'event',
  'night_out',
  'unknown',
] as const;
export const SEASONS = ['spring', 'summer', 'fall', 'winter', 'all_season'] as const;
export const MATERIALS = [
  'cotton',
  'polyester',
  'wool',
  'cashmere',
  'linen',
  'silk',
  'leather',
  'suede',
  'denim',
  'fleece',
  'nylon',
  'viscose',
  'rayon',
  'modal',
  'lyocell',
  'acrylic',
  'canvas',
  'corduroy',
  'merino',
  'unknown',
] as const;
export const PATTERNS = [
  'solid',
  'stripe',
  'plaid',
  'check',
  'floral',
  'graphic',
  'logo',
  'camo',
  'animal',
  'colorblock',
  'ribbed',
  'textured',
  'unknown',
] as const;
export const SUBCATEGORIES = [
  't-shirt',
  'hoodie',
  'sweatshirt',
  'sweater',
  'polo',
  'tank',
  'shirt',
  'top',
  'jeans',
  'shorts',
  'skirt',
  'joggers',
  'leggings',
  'pants',
  'sneakers',
  'boots',
  'loafers',
  'sandals',
  'heels',
  'shoes',
  'puffer',
  'coat',
  'blazer',
  'vest',
  'jacket',
  'headwear',
  'bag',
  'belt',
  'jewelry',
  'eyewear',
  'accessory',
  'unknown',
] as const;

export type GenderAttr = (typeof GENDERS)[number];
export type FitAttr = (typeof FITS)[number];
export type SilhouetteAttr = (typeof SILHOUETTES)[number];
export type FormalityAttr = (typeof FORMALITIES)[number];
export type StyleAttr = (typeof STYLES)[number];
export type AestheticAttr = (typeof AESTHETICS)[number];
export type OccasionAttr = (typeof OCCASIONS)[number];
export type SeasonAttr = (typeof SEASONS)[number];
export type MaterialAttr = (typeof MATERIALS)[number];
export type PatternAttr = (typeof PATTERNS)[number];
export type SubcategoryAttr = (typeof SUBCATEGORIES)[number];

export type EnrichedAttributes = {
  gender: GenderAttr;
  subcategory: SubcategoryAttr;
  fit: FitAttr;
  silhouette: SilhouetteAttr;
  pattern: PatternAttr;
  material: MaterialAttr;
  style_tags: StyleAttr[];
  aesthetic_tags: AestheticAttr[];
  occasion_tags: OccasionAttr[];
  season_tags: SeasonAttr[];
  formality: FormalityAttr;
  fit_confidence: number;
  silhouette_confidence: number;
  gender_confidence: number;
  style_confidence: number;
};

export function attrKey(value: string): string {
  return value.trim().toLowerCase().replace(/['’]/g, '').replace(/[\s-]+/g, '_');
}

function inSet<T extends string>(value: string, allowed: readonly T[]): T | null {
  const key = attrKey(value);
  return (allowed as readonly string[]).includes(key) ? (key as T) : null;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== 'string') return fallback;
  return inSet(value, allowed) ?? fallback;
}

function pickTags<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const tags: T[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const tag = inSet(item, allowed);
    if (tag && tag !== 'unknown' && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, 6);
}

function pickConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function contentFingerprint(input: {
  name: string;
  description: string | null;
  brand: string;
  category: string;
  image_url: string;
}): string {
  return [input.name, input.description ?? '', input.brand, input.category, input.image_url].join(
    '\u001f',
  );
}

export function classifySchemaPrompt(): string {
  return `Return ONLY JSON with this exact shape. Every enum value must be one of the listed options. Use "unknown" or [] when evidence is insufficient — never guess.
{
  "gender": ${JSON.stringify(GENDERS)},
  "subcategory": ${JSON.stringify(SUBCATEGORIES)},
  "fit": ${JSON.stringify(FITS)},
  "silhouette": ${JSON.stringify(SILHOUETTES)},
  "pattern": ${JSON.stringify(PATTERNS)},
  "material": ${JSON.stringify(MATERIALS)},
  "style_tags": ${JSON.stringify(STYLES.filter((tag) => tag !== 'unknown'))},
  "aesthetic_tags": ${JSON.stringify(AESTHETICS.filter((tag) => tag !== 'unknown'))},
  "occasion_tags": ${JSON.stringify(OCCASIONS.filter((tag) => tag !== 'unknown'))},
  "season_tags": ${JSON.stringify(SEASONS)},
  "formality": ${JSON.stringify(FORMALITIES)},
  "fit_confidence": "0-1 number",
  "silhouette_confidence": "0-1 number",
  "gender_confidence": "0-1 number",
  "style_confidence": "0-1 number"
}`;
}

/**
 * Coerce Gemini JSON onto the enum schema. Unknown/invalid scalars become "unknown";
 * invalid tags are dropped. Throws if the payload is not an object.
 */
export function parseEnrichedAttributes(input: unknown): EnrichedAttributes {
  if (!input || typeof input !== 'object') {
    throw new Error('invalid_enrichment');
  }
  const row = input as Record<string, unknown>;
  return {
    gender: pickEnum(row.gender, GENDERS, 'unknown'),
    subcategory: pickEnum(row.subcategory, SUBCATEGORIES, 'unknown'),
    fit: pickEnum(row.fit, FITS, 'unknown'),
    silhouette: pickEnum(row.silhouette, SILHOUETTES, 'unknown'),
    pattern: pickEnum(row.pattern, PATTERNS, 'unknown'),
    material: pickEnum(row.material, MATERIALS, 'unknown'),
    style_tags: pickTags(row.style_tags, STYLES),
    aesthetic_tags: pickTags(row.aesthetic_tags, AESTHETICS),
    occasion_tags: pickTags(row.occasion_tags, OCCASIONS),
    season_tags: pickTags(row.season_tags, SEASONS),
    formality: pickEnum(row.formality, FORMALITIES, 'unknown'),
    fit_confidence: pickConfidence(row.fit_confidence),
    silhouette_confidence: pickConfidence(row.silhouette_confidence),
    gender_confidence: pickConfidence(row.gender_confidence),
    style_confidence: pickConfidence(row.style_confidence),
  };
}

export function currentSeason(): SeasonAttr {
  const month = new Date().getUTCMonth();
  if (month <= 1 || month === 11) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'fall';
}

export function occasionFormality(occasion: string): FormalityAttr[] {
  switch (attrKey(occasion)) {
    case 'work':
    case 'event':
      return ['smart_casual', 'formal'];
    case 'party':
    case 'night_out':
    case 'date':
      return ['smart_casual', 'casual'];
    case 'vacation':
      return ['casual', 'athletic'];
    default:
      return ['casual', 'athletic', 'smart_casual'];
  }
}
