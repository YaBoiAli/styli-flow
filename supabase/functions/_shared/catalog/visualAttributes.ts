/**
 * Phase 4 visual product attributes.
 *
 * These describe what a garment looks like. They do not pick outfits.
 * Precedence when filling fit / silhouette / pattern on a product:
 *   1. High-confidence existing structured catalog values
 *   2. High-confidence visual inference (confidence >= 0.6)
 *   3. Weak text inference (scorer keywords)
 *   4. Unknown (null)
 *
 * Visual aesthetics never overwrite style_tags.
 * Catalog `material` stays source-owned; visual uses material_appearance.
 */
import { attrKey, contentFingerprint } from './fashionAttributes.ts';
import { inspectGeminiPayload } from '../geminiResponse.ts';

export const VISUAL_FITS = [
  'fitted',
  'slim',
  'regular',
  'relaxed',
  'oversized',
  'baggy',
] as const;

export const VISUAL_SILHOUETTES = [
  'fitted',
  'straight',
  'boxy',
  'cropped',
  'relaxed',
  'oversized',
  'wide',
  'structured',
] as const;

export const VISUAL_LENGTHS = ['cropped', 'short', 'regular', 'long'] as const;

export const VISUAL_PATTERNS = [
  'solid',
  'graphic',
  'stripe',
  'plaid',
  'check',
  'floral',
  'camouflage',
  'logo',
  'abstract',
  'other',
] as const;

export const VISUAL_SCALES = ['small', 'medium', 'large'] as const;
export const VISUAL_INTENSITIES = ['low', 'medium', 'high'] as const;
export const VISUAL_WEIGHTS = ['light', 'medium', 'heavy'] as const;
export const VISUAL_SATURATIONS = ['low', 'medium', 'high'] as const;
export const VISUAL_BRIGHTNESS = ['dark', 'medium', 'light'] as const;

export const VISUAL_MATERIALS = [
  'light_cotton',
  'heavy_cotton',
  'denim',
  'leather',
  'knit',
  'fleece',
  'technical',
  'silky',
  'wool',
  'other',
] as const;

export const VISUAL_COLOR_FAMILIES = [
  'black',
  'white',
  'gray',
  'brown',
  'beige',
  'cream',
  'navy',
  'blue',
  'red',
  'pink',
  'orange',
  'yellow',
  'green',
  'purple',
  'gold',
  'silver',
] as const;

export const VISUAL_AESTHETICS = [
  'streetwear',
  'y2k',
  'minimal',
  'minimalist',
  'preppy',
  'old_money',
  'athletic',
  'vintage',
  'grunge',
  'formal',
  'casual',
  'workwear',
  'outdoor',
  'western',
  'punk',
  'clean_girl',
  'quiet_luxury',
  'dark_academia',
  'sporty',
  'romantic',
  'edgy',
  'classic',
  'coastal',
] as const;

export const VISUAL_SEASONS = ['spring', 'summer', 'fall', 'winter', 'all_season'] as const;

export const MAX_VISUAL_ANALYSIS_PRODUCTS = 15;
export const VISUAL_ANALYSIS_BATCH_SIZE = 5;
/** Visual data below this does not affect scoring. */
export const VISUAL_CONFIDENCE_MIN = 0.45;
/** Visual data at or above this may fill empty catalog fit/silhouette/pattern. */
export const VISUAL_CONFIDENCE_HIGH = 0.6;

export const COLOR_PLACEMENT_WEIGHT: Record<string, number> = {
  top: 1,
  outerwear: 0.85,
  accessory: 0.7,
  bottom: 0.25,
  shoes: 0.08,
};

export type VisualFit = (typeof VISUAL_FITS)[number];
export type VisualSilhouette = (typeof VISUAL_SILHOUETTES)[number];
export type VisualLength = (typeof VISUAL_LENGTHS)[number];
export type VisualPattern = (typeof VISUAL_PATTERNS)[number];
export type VisualScale = (typeof VISUAL_SCALES)[number];
export type VisualLevel = (typeof VISUAL_INTENSITIES)[number];
export type VisualWeight = (typeof VISUAL_WEIGHTS)[number];
export type VisualSaturation = (typeof VISUAL_SATURATIONS)[number];
export type VisualBrightness = (typeof VISUAL_BRIGHTNESS)[number];
export type VisualMaterialAppearance = (typeof VISUAL_MATERIALS)[number];
export type VisualColorFamily = (typeof VISUAL_COLOR_FAMILIES)[number];
export type VisualAesthetic = (typeof VISUAL_AESTHETICS)[number];

export type VisualAttributes = {
  primary_color: string | null;
  secondary_colors: string[];
  color_family: VisualColorFamily | null;
  saturation: VisualSaturation | null;
  brightness: VisualBrightness | null;
  primary_hex: string | null;
  fit: VisualFit | null;
  silhouette: VisualSilhouette | null;
  length: VisualLength | null;
  pattern: VisualPattern | null;
  pattern_scale: VisualScale | null;
  pattern_intensity: VisualLevel | null;
  visual_weight: VisualWeight | null;
  visual_intensity: number | null;
  material_appearance: VisualMaterialAppearance | null;
  aesthetics: VisualAesthetic[];
  formality: number | null;
  season: string[];
  confidence: number | null;
};

export type VisualAnalysisRecord = {
  product_id: string;
  confidence: number;
  attributes: VisualAttributes;
};

export type VisualTarget = {
  id: string;
  category: string;
  image_url?: string | null;
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  color?: string | null;
  colors?: string[];
  material?: string | null;
  fit?: string | null;
  silhouette?: string | null;
  pattern?: string | null;
  formality?: string | null;
  style_tags?: string[];
  visual_attributes?: VisualAttributes | null;
};

const NEUTRAL_FAMILIES = new Set<string>([
  'black',
  'white',
  'gray',
  'brown',
  'beige',
  'cream',
  'navy',
  'gold',
  'silver',
]);

function inSet<T extends string>(value: string, allowed: readonly T[]): T | null {
  const key = attrKey(value);
  const aliases: Record<string, string> = {
    camo: 'camouflage',
    camoflage: 'camouflage',
    wide_leg: 'wide',
    wideleg: 'wide',
    baggy: 'baggy',
    loose: 'relaxed',
    unknown: '',
  };
  const mapped = aliases[key] ?? key;
  if (!mapped) return null;
  return (allowed as readonly string[]).includes(mapped) ? (mapped as T) : null;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return inSet(value, allowed);
}

function pickStringList(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().toLowerCase();
    if (!trimmed || trimmed === 'unknown' || out.includes(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

function pickTags<T extends string>(value: unknown, allowed: readonly T[], max = 6): T[] {
  if (!Array.isArray(value)) return [];
  const tags: T[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const tag = inSet(item, allowed);
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= max) break;
  }
  return tags;
}

export function pickConfidence(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

function pickIntensityScore(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 1) return Math.round(n * 10);
  return Math.max(0, Math.min(10, Math.round(n)));
}

function pickHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

function pickColorLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === 'unknown' || trimmed === 'n/a') return null;
  return trimmed.slice(0, 40);
}

export function emptyVisualAttributes(confidence: number | null = null): VisualAttributes {
  return {
    primary_color: null,
    secondary_colors: [],
    color_family: null,
    saturation: null,
    brightness: null,
    primary_hex: null,
    fit: null,
    silhouette: null,
    length: null,
    pattern: null,
    pattern_scale: null,
    pattern_intensity: null,
    visual_weight: null,
    visual_intensity: null,
    material_appearance: null,
    aesthetics: [],
    formality: null,
    season: [],
    confidence,
  };
}

/**
 * Coerce model JSON onto the visual schema. Invalid enums become null.
 * Returns null only when the payload is not an object.
 */
export function parseVisualAttributes(input: unknown): VisualAttributes | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const confidence =
    pickConfidence(row.confidence) ??
    pickConfidence(row.overall_confidence);
  return {
    primary_color: pickColorLabel(row.primary_color),
    secondary_colors: pickStringList(row.secondary_colors, 4),
    color_family: pickEnum(row.color_family, VISUAL_COLOR_FAMILIES),
    saturation: pickEnum(row.saturation, VISUAL_SATURATIONS),
    brightness: pickEnum(row.brightness, VISUAL_BRIGHTNESS),
    primary_hex: pickHex(row.primary_hex) ?? pickHex(row.hex),
    fit: pickEnum(row.fit, VISUAL_FITS),
    silhouette: pickEnum(row.silhouette, VISUAL_SILHOUETTES),
    length: pickEnum(row.length, VISUAL_LENGTHS),
    pattern: pickEnum(row.pattern, VISUAL_PATTERNS),
    pattern_scale: pickEnum(row.pattern_scale, VISUAL_SCALES),
    pattern_intensity: pickEnum(row.pattern_intensity, VISUAL_INTENSITIES),
    visual_weight: pickEnum(row.visual_weight, VISUAL_WEIGHTS),
    visual_intensity: pickIntensityScore(row.visual_intensity),
    material_appearance: pickEnum(row.material_appearance, VISUAL_MATERIALS),
    aesthetics: pickTags(row.aesthetics, VISUAL_AESTHETICS),
    formality: pickConfidence(row.formality),
    season: pickTags(row.season, VISUAL_SEASONS),
    confidence,
  };
}

export function parseModelJsonSafe(content: string): unknown | null {
  try {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    return JSON.parse(fenced ? fenced[1].trim() : trimmed);
  } catch {
    return null;
  }
}

function readProductId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

function recordFromRow(
  row: Record<string, unknown>,
  allowedIds: Set<string> | null,
): VisualAnalysisRecord | null {
  const productId =
    readProductId(row.product_id) ?? readProductId(row.id);
  if (!productId) return null;
  if (allowedIds && !allowedIds.has(productId)) return null;
  const nested = row.visual_attributes ?? row.attributes ?? row;
  const attributes = parseVisualAttributes(nested);
  if (!attributes) return null;
  const confidence =
    pickConfidence(row.confidence) ??
    attributes.confidence ??
    0;
  return {
    product_id: productId,
    confidence,
    attributes: { ...attributes, confidence },
  };
}

/** Fail-safe batch parse. Malformed JSON or bad rows are skipped, never thrown. */
export function parseVisualAnalysisResponse(
  content: string,
  allowedIds: Set<string> | null = null,
): VisualAnalysisRecord[] {
  const parsed = parseModelJsonSafe(content);
  if (!parsed) return [];
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { products?: unknown }).products)
      ? (parsed as { products: unknown[] }).products
      : [parsed];
  const out: VisualAnalysisRecord[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = recordFromRow(row as Record<string, unknown>, allowedIds);
    if (!record || seen.has(record.product_id)) continue;
    seen.add(record.product_id);
    out.push(record);
  }
  return out;
}

export type VisualGeminiStage =
  | 'gemini_response'
  | 'json_parse'
  | 'schema_parse';

export type VisualGeminiInterpretResult =
  | { ok: true; records: VisualAnalysisRecord[] }
  | { ok: false; stage: VisualGeminiStage; error_type: string; message?: string };

/**
 * Maps a Gemini generateContent payload to visual records, or a diagnostic stage.
 * Never treats an empty/malformed payload as success.
 */
export function interpretVisualGeminiPayload(
  payload: unknown,
  allowedIds: Set<string> | null = null,
): VisualGeminiInterpretResult {
  const extracted = inspectGeminiPayload(payload);
  if (extracted.blockReason) {
    return {
      ok: false,
      stage: 'gemini_response',
      error_type: `BLOCKED_${extracted.blockReason}`,
      message: 'prompt_blocked',
    };
  }
  if (!extracted.text.trim()) {
    return {
      ok: false,
      stage: 'gemini_response',
      error_type: extracted.finishReason ? `EMPTY_TEXT_${extracted.finishReason}` : 'EMPTY_TEXT',
      message: extracted.thoughtParts > 0 && extracted.textParts === 0
        ? 'thought_only_empty_json'
        : 'empty_candidates',
    };
  }
  if (parseModelJsonSafe(extracted.text) == null) {
    return { ok: false, stage: 'json_parse', error_type: 'invalid_json' };
  }
  const records = parseVisualAnalysisResponse(extracted.text, allowedIds);
  if (!records.length) {
    return { ok: false, stage: 'schema_parse', error_type: 'no_visual_records' };
  }
  return { ok: true, records };
}

export function isReliableStructuredValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const key = attrKey(value);
  return Boolean(key) && key !== 'unknown';
}

export function visualIsUsable(
  item: { visual_attributes?: VisualAttributes | null },
): boolean {
  const confidence = item.visual_attributes?.confidence;
  return typeof confidence === 'number' && confidence >= VISUAL_CONFIDENCE_MIN;
}

export function colorPlacementWeight(
  category: string,
  footwearPreference: 'include' | 'none' | undefined,
): number {
  if (category === 'shoes' && footwearPreference === 'none') return 0;
  return COLOR_PLACEMENT_WEIGHT[category] ?? 0.4;
}

export function isNeutralColorFamily(family: string | null | undefined): boolean {
  return Boolean(family && NEUTRAL_FAMILIES.has(family));
}

export function visualSchemaPrompt(): string {
  return `Return ONLY JSON with this exact shape. Use null or [] when the image is ambiguous — never guess.
{
  "products": [
    {
      "product_id": "string",
      "confidence": "0-1 number for the whole analysis",
      "visual_attributes": {
        "primary_color": "specific observed color or null",
        "secondary_colors": ["string"],
        "color_family": ${JSON.stringify(VISUAL_COLOR_FAMILIES)},
        "saturation": ${JSON.stringify(VISUAL_SATURATIONS)},
        "brightness": ${JSON.stringify(VISUAL_BRIGHTNESS)},
        "primary_hex": "#rrggbb or null",
        "fit": ${JSON.stringify(VISUAL_FITS)},
        "silhouette": ${JSON.stringify(VISUAL_SILHOUETTES)},
        "length": ${JSON.stringify(VISUAL_LENGTHS)},
        "pattern": ${JSON.stringify(VISUAL_PATTERNS)},
        "pattern_scale": ${JSON.stringify(VISUAL_SCALES)},
        "pattern_intensity": ${JSON.stringify(VISUAL_INTENSITIES)},
        "visual_weight": ${JSON.stringify(VISUAL_WEIGHTS)},
        "visual_intensity": "0-10 number or null",
        "material_appearance": ${JSON.stringify(VISUAL_MATERIALS)},
        "aesthetics": ${JSON.stringify(VISUAL_AESTHETICS)},
        "formality": "0-1 number or null",
        "season": ${JSON.stringify(VISUAL_SEASONS)}
      }
    }
  ]
}`;
}

export function visualForPrompt(
  attributes: VisualAttributes | null | undefined,
): Record<string, unknown> | undefined {
  if (!attributes || !visualIsUsable({ visual_attributes: attributes })) return undefined;
  const visual: Record<string, unknown> = {};
  if (attributes.primary_color) visual.primary_color = attributes.primary_color;
  if (attributes.secondary_colors.length) visual.secondary_colors = attributes.secondary_colors;
  if (attributes.color_family) visual.color_family = attributes.color_family;
  if (attributes.saturation) visual.saturation = attributes.saturation;
  if (attributes.brightness) visual.brightness = attributes.brightness;
  if (attributes.fit) visual.fit = attributes.fit;
  if (attributes.silhouette) visual.silhouette = attributes.silhouette;
  if (attributes.length) visual.length = attributes.length;
  if (attributes.pattern) visual.pattern = attributes.pattern;
  if (attributes.pattern_scale) visual.pattern_scale = attributes.pattern_scale;
  if (attributes.pattern_intensity) visual.pattern_intensity = attributes.pattern_intensity;
  if (attributes.visual_weight) visual.visual_weight = attributes.visual_weight;
  if (attributes.visual_intensity != null) visual.visual_intensity = attributes.visual_intensity;
  if (attributes.material_appearance) visual.material_appearance = attributes.material_appearance;
  if (attributes.aesthetics.length) visual.aesthetics = attributes.aesthetics;
  return Object.keys(visual).length ? visual : undefined;
}

export function hasUsableImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function visualCacheKey(product: VisualTarget): string {
  return contentFingerprint({
    name: product.name ?? product.id,
    description: product.description ?? null,
    brand: product.brand ?? '',
    category: product.category,
    image_url: product.image_url ?? '',
  });
}

/**
 * Shortlist ~10–15 already-ranked candidates that have usable images.
 * Skips shoes when footwear is none. Does not re-rank.
 */
export function selectVisualAnalysisTargets<T extends VisualTarget>(
  products: T[],
  options: {
    footwearPreference?: 'include' | 'none';
    max?: number;
  } = {},
): T[] {
  const max = options.max ?? MAX_VISUAL_ANALYSIS_PRODUCTS;
  const skipShoes = options.footwearPreference === 'none';
  const eligible = products.filter((product) => {
    if (
      skipShoes &&
      (product.category === 'shoes' ||
        product.category === 'footwear' ||
        /\b(sneakers?|shoes?|boots?|sandals?|heels?|loafers?|slides?|mules?|trainers?|footwear|oxfords|derbys)\b/i.test(
          product.name ?? '',
        ))
    ) {
      return false;
    }
    if (product.visual_attributes && visualIsUsable(product)) return false;
    return hasUsableImageUrl(product.image_url);
  });

  const byCategory = new Map<string, T[]>();
  for (const product of eligible) {
    const list = byCategory.get(product.category) ?? [];
    list.push(product);
    byCategory.set(product.category, list);
  }

  const order = skipShoes
    ? ['top', 'bottom', 'outerwear', 'accessory']
    : ['top', 'bottom', 'shoes', 'outerwear', 'accessory'];
  const queues = order
    .map((category) => byCategory.get(category) ?? [])
    .filter((list) => list.length);
  const selected: T[] = [];
  const seen = new Set<string>();
  let index = 0;
  while (selected.length < max && queues.some((list) => list.length)) {
    const queue = queues[index % queues.length];
    index += 1;
    const next = queue.shift();
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    selected.push(next);
  }
  return selected;
}

function preferField(
  existing: string | null | undefined,
  visual: string | null,
  confidence: number,
): string | null {
  if (isReliableStructuredValue(existing)) return existing ?? null;
  if (visual && confidence >= VISUAL_CONFIDENCE_HIGH) return visual;
  return existing ?? null;
}

export function applyVisualRecord<T extends VisualTarget>(
  product: T,
  record: VisualAnalysisRecord,
): T {
  const attributes = { ...record.attributes, confidence: record.confidence };
  return {
    ...product,
    visual_attributes: attributes,
    fit: preferField(product.fit, attributes.fit, record.confidence),
    silhouette: preferField(
      product.silhouette,
      attributes.silhouette === 'wide' ? 'wide_leg' : attributes.silhouette,
      record.confidence,
    ),
    pattern: preferField(
      product.pattern,
      attributes.pattern === 'camouflage' ? 'camo' : attributes.pattern,
      record.confidence,
    ),
  };
}

export function applyVisualRecords<T extends VisualTarget>(
  products: T[],
  records: Iterable<VisualAnalysisRecord>,
): T[] {
  const byId = new Map<string, VisualAnalysisRecord>();
  for (const record of records) byId.set(record.product_id, record);
  return products.map((product) => {
    const record = byId.get(product.id);
    return record ? applyVisualRecord(product, record) : product;
  });
}

export function resolvedFit(
  item: { fit?: string | null; visual_attributes?: VisualAttributes | null },
): string | null {
  if (isReliableStructuredValue(item.fit)) return item.fit ?? null;
  if (visualIsUsable(item) && item.visual_attributes?.fit) return item.visual_attributes.fit;
  return item.fit && item.fit !== 'unknown' ? item.fit : null;
}

export function resolvedSilhouette(
  item: { silhouette?: string | null; visual_attributes?: VisualAttributes | null },
): string | null {
  if (isReliableStructuredValue(item.silhouette)) return item.silhouette ?? null;
  const visual = item.visual_attributes?.silhouette;
  if (visualIsUsable(item) && visual) return visual === 'wide' ? 'wide_leg' : visual;
  return item.silhouette && item.silhouette !== 'unknown' ? item.silhouette : null;
}

export function resolvedPattern(
  item: { pattern?: string | null; visual_attributes?: VisualAttributes | null },
): string | null {
  if (isReliableStructuredValue(item.pattern)) return item.pattern ?? null;
  const visual = item.visual_attributes?.pattern;
  if (visualIsUsable(item) && visual) return visual === 'camouflage' ? 'camo' : visual;
  return item.pattern && item.pattern !== 'unknown' ? item.pattern : null;
}

export function logVisualEnrichment(stats: {
  attempted: number;
  successful: number;
  failed: number;
}): void {
  console.log(`[VISUAL_ENRICHMENT] ${JSON.stringify(stats)}`);
}
