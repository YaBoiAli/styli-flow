/**
 * Deterministic outfit-level quality scorer.
 * Judges a complete outfit, not products in isolation.
 * Independent of Gemini. validateAndBuild stays the structural gate.
 */
import {
  attrKey,
  currentSeason,
  occasionFormality,
  type FormalityAttr,
  type SeasonAttr,
} from './fashionAttributes.ts';
import {
  isClassyLook,
  keywordHits,
  looksLikeDressFootwear,
  SKIN_TONE_COLORS,
  type SkinTonePreference,
  STYLE_FIT,
  STYLE_KEYWORDS,
  STYLE_SILHOUETTE,
  styleAliasTags,
} from './fashionSignals.ts';

/** CatalogProduct from generate-outfit/catalog.ts satisfies this view. */
export type OutfitScoreItem = {
  category: string;
  subcategory?: string | null;
  name: string;
  brand?: string | null;
  color?: string | null;
  colors?: string[];
  material?: string | null;
  description?: string | null;
  purchase_url?: string | null;
  style_tags?: string[];
  aesthetic_tags?: string[];
  occasion_tags?: string[];
  season_tags?: string[];
  fit?: string | null;
  silhouette?: string | null;
  pattern?: string | null;
  formality?: string | null;
};

/**
 * Scoring context. Extends generate-outfit StylingContext with the
 * style / occasion / skin-tone fields that function actually needs.
 */
export type OutfitScoringContext = {
  style: string;
  occasion: string;
  skinTone?: SkinTonePreference | null;
  measurements?: Record<string, number | string> | null;
  /** Test override. Defaults to currentSeason(). */
  season?: SeasonAttr;
};

export type OutfitScoreBreakdown = {
  style: number;
  color: number;
  proportion: number;
  skinTone: number;
  occasion: number;
  fit: number;
  season: number;
  cohesion: number;
};

export type OutfitScore = {
  score: number;
  breakdown: OutfitScoreBreakdown;
  issues: string[];
  suggestions: string[];
};

export const OUTFIT_SCORE_WEIGHTS = {
  style: 0.2,
  color: 0.2,
  proportion: 0.2,
  skinTone: 0.1,
  occasion: 0.1,
  fit: 0.1,
  season: 0.05,
  cohesion: 0.05,
} as const;

const NEUTRAL_DIMENSION = 70;
const LOUD_PATTERNS = new Set(['graphic', 'floral', 'plaid', 'camo', 'animal', 'logo']);
const VOLUME_FRIENDLY_STYLES = new Set([
  'streetwear',
  'elevated_streetwear',
  'elevated streetwear',
  'y2k',
  'grunge',
]);
const NARROW_FRIENDLY_STYLES = new Set([
  'formal',
  'old_money',
  'old money',
  'minimalist',
  'quiet_luxury',
  'quiet luxury',
  'preppy',
]);

type ColorFamily = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';
type ColorToken = {
  label: string;
  kind: 'neutral' | 'chromatic';
  family?: ColorFamily;
  saturated: boolean;
};

const COLOR_WHEEL: ColorFamily[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

/**
 * Specific phrases first so "royal blue" does not collapse to generic blue.
 * Navy is a neutral, matching the audit palette.
 */
const COLOR_LEXICON: Array<{
  pattern: RegExp;
  label: string;
  kind: 'neutral' | 'chromatic';
  family?: ColorFamily;
  saturated?: boolean;
}> = [
  { pattern: /\bneon\s+green\b/, label: 'neon green', kind: 'chromatic', family: 'green', saturated: true },
  { pattern: /\bneon\s+orange\b/, label: 'neon orange', kind: 'chromatic', family: 'orange', saturated: true },
  { pattern: /\bneon\s+pink\b/, label: 'neon pink', kind: 'chromatic', family: 'pink', saturated: true },
  { pattern: /\bneon\s+yellow\b/, label: 'neon yellow', kind: 'chromatic', family: 'yellow', saturated: true },
  { pattern: /\broyal\s+blue\b/, label: 'royal blue', kind: 'chromatic', family: 'blue', saturated: true },
  { pattern: /\bbright\s+orange\b/, label: 'bright orange', kind: 'chromatic', family: 'orange', saturated: true },
  { pattern: /\borange\b/, label: 'orange', kind: 'chromatic', family: 'orange' },
  { pattern: /\bcobalt\b/, label: 'cobalt', kind: 'chromatic', family: 'blue', saturated: true },
  { pattern: /\bfuchsia\b|\bhot\s+pink\b/, label: 'fuchsia', kind: 'chromatic', family: 'pink', saturated: true },
  { pattern: /\bburgundy\b/, label: 'burgundy', kind: 'chromatic', family: 'red' },
  { pattern: /\bmaroon\b/, label: 'maroon', kind: 'chromatic', family: 'red' },
  { pattern: /\bwine\b/, label: 'wine', kind: 'chromatic', family: 'red' },
  { pattern: /\bplum\b/, label: 'plum', kind: 'chromatic', family: 'purple' },
  { pattern: /\bolive\b/, label: 'olive', kind: 'chromatic', family: 'green' },
  { pattern: /\bforest\b/, label: 'forest', kind: 'chromatic', family: 'green' },
  { pattern: /\bemerald\b/, label: 'emerald', kind: 'chromatic', family: 'green' },
  { pattern: /\bteal\b/, label: 'teal', kind: 'chromatic', family: 'green' },
  { pattern: /\brust\b/, label: 'rust', kind: 'chromatic', family: 'orange' },
  { pattern: /\bterracotta\b/, label: 'terracotta', kind: 'chromatic', family: 'orange' },
  { pattern: /\bcoral\b/, label: 'coral', kind: 'chromatic', family: 'orange' },
  { pattern: /\bcharcoal\b/, label: 'charcoal', kind: 'neutral' },
  { pattern: /\bivory\b/, label: 'ivory', kind: 'neutral' },
  { pattern: /\bcream\b/, label: 'cream', kind: 'neutral' },
  { pattern: /\bcamel\b/, label: 'camel', kind: 'neutral' },
  { pattern: /\bbeige\b|\bnude\b|\bkhaki\b/, label: 'beige', kind: 'neutral' },
  { pattern: /\bnavy\b/, label: 'navy', kind: 'neutral' },
  { pattern: /\bcharcoal\b|\bslate\b/, label: 'charcoal', kind: 'neutral' },
  { pattern: /\bgray\b|\bgrey\b|\bsilver\b/, label: 'gray', kind: 'neutral' },
  { pattern: /\bbrown\b|\bchocolate\b|\bespresso\b/, label: 'brown', kind: 'neutral' },
  { pattern: /\bblack\b/, label: 'black', kind: 'neutral' },
  { pattern: /\bwhite\b/, label: 'white', kind: 'neutral' },
  { pattern: /\bgold\b/, label: 'gold', kind: 'chromatic', family: 'yellow' },
  { pattern: /\bpink\b|\brose\b/, label: 'pink', kind: 'chromatic', family: 'pink' },
  { pattern: /\bpurple\b|\blavender\b|\bviolet\b/, label: 'purple', kind: 'chromatic', family: 'purple' },
  { pattern: /\bred\b|\bcrimson\b/, label: 'red', kind: 'chromatic', family: 'red' },
  { pattern: /\byellow\b|\bmustard\b/, label: 'yellow', kind: 'chromatic', family: 'yellow' },
  { pattern: /\bgreen\b/, label: 'green', kind: 'chromatic', family: 'green' },
  { pattern: /\bblue\b/, label: 'blue', kind: 'chromatic', family: 'blue' },
  { pattern: /\bpeach\b/, label: 'peach', kind: 'chromatic', family: 'orange' },
];

type DimensionResult = {
  score: number;
  issues: string[];
  suggestions: string[];
};

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function itemText(item: OutfitScoreItem): string {
  return [
    item.name,
    item.subcategory,
    item.color,
    ...(item.colors ?? []),
    item.material,
    item.pattern,
    item.fit,
    item.silhouette,
    item.formality,
    item.description?.slice(0, 200),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function colorText(item: OutfitScoreItem): string {
  return [item.color, ...(item.colors ?? []), item.name, item.description?.slice(0, 120)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function extractColorTokens(item: OutfitScoreItem): ColorToken[] {
  const text = colorText(item);
  const found: ColorToken[] = [];
  const seen = new Set<string>();
  const neon = /\bneon\b|\belectric\b/.test(text);
  for (const entry of COLOR_LEXICON) {
    if (!entry.pattern.test(text)) continue;
    if (seen.has(entry.label)) continue;
    seen.add(entry.label);
    found.push({
      label: entry.label,
      kind: entry.kind,
      family: entry.family,
      saturated: Boolean(entry.saturated) || (neon && entry.kind === 'chromatic'),
    });
  }
  return found;
}

function complementary(a: ColorFamily, b: ColorFamily): boolean {
  if (a === b) return false;
  const resolve = (family: ColorFamily): ColorFamily[] =>
    family === 'pink' ? ['red', 'purple'] : [family];
  for (const left of resolve(a)) {
    for (const right of resolve(b)) {
      const i = COLOR_WHEEL.indexOf(left);
      const j = COLOR_WHEEL.indexOf(right);
      if (i >= 0 && j >= 0 && Math.abs(i - j) === 3) return true;
    }
  }
  return false;
}

function analogous(a: ColorFamily, b: ColorFamily): boolean {
  if (a === 'pink' && (b === 'red' || b === 'purple')) return true;
  if (b === 'pink' && (a === 'red' || a === 'purple')) return true;
  const i = COLOR_WHEEL.indexOf(a);
  const j = COLOR_WHEEL.indexOf(b);
  if (i < 0 || j < 0) return a === b;
  const gap = Math.abs(i - j);
  return gap === 1 || gap === 5;
}

function styleKeys(style: string): string[] {
  return styleAliasTags(style);
}

function requestedStyleFriendlyVolume(style: string): boolean {
  const keys = styleKeys(style).map((tag) => attrKey(tag));
  return keys.some((key) => VOLUME_FRIENDLY_STYLES.has(key) || VOLUME_FRIENDLY_STYLES.has(key.replace(/_/g, ' ')));
}

function requestedStyleFriendlyNarrow(style: string): boolean {
  const keys = styleKeys(style).map((tag) => attrKey(tag));
  return keys.some((key) => NARROW_FRIENDLY_STYLES.has(key) || NARROW_FRIENDLY_STYLES.has(key.replace(/_/g, ' ')));
}

function itemStyleAffinity(item: OutfitScoreItem, style: string): number {
  const aliases = styleKeys(style);
  const tags = [...(item.style_tags ?? []), ...(item.aesthetic_tags ?? [])].map(attrKey);
  const aliasKeys = aliases.map(attrKey);
  let points = 40;
  if (tags.some((tag) => aliasKeys.includes(tag))) points += 30;
  const fitKey = item.fit && item.fit !== 'unknown' ? item.fit : null;
  const silKey = item.silhouette && item.silhouette !== 'unknown' ? item.silhouette : null;
  for (const alias of aliases) {
    const key = attrKey(alias);
    if (fitKey && (STYLE_FIT[alias] ?? STYLE_FIT[key] ?? []).includes(fitKey)) points += 10;
    if (silKey && (STYLE_SILHOUETTE[alias] ?? STYLE_SILHOUETTE[key] ?? []).includes(silKey)) {
      points += 10;
    }
  }
  const text = itemText(item);
  for (const [index, alias] of aliases.entries()) {
    const hits = keywordHits(text, STYLE_KEYWORDS[alias] ?? STYLE_KEYWORDS[attrKey(alias)] ?? []);
    points += Math.min(index === 0 ? hits * 6 : hits * 3, 18);
  }
  return clamp100(points);
}

const STYLE_CLUSTERS = {
  street: ['streetwear', 'elevated_streetwear', 'athleisure', 'grunge'],
  prep: ['old_money', 'quiet_luxury', 'preppy', 'formal', 'dark_academia'],
  y2k: ['y2k'],
} as const;

function itemCluster(item: OutfitScoreItem): keyof typeof STYLE_CLUSTERS | null {
  const tags = [...(item.style_tags ?? []), ...(item.aesthetic_tags ?? [])].map(attrKey);
  const text = itemText(item);
  if (tags.some((tag) => (STYLE_CLUSTERS.y2k as readonly string[]).includes(tag)) || keywordHits(text, STYLE_KEYWORDS.y2k)) {
    return 'y2k';
  }
  if (tags.some((tag) => (STYLE_CLUSTERS.prep as readonly string[]).includes(tag))) return 'prep';
  if (tags.some((tag) => (STYLE_CLUSTERS.street as readonly string[]).includes(tag))) return 'street';
  if (keywordHits(text, STYLE_KEYWORDS['old money']) >= 2) return 'prep';
  if (keywordHits(text, STYLE_KEYWORDS.streetwear) >= 2) return 'street';
  return null;
}

function scoreStyle(items: OutfitScoreItem[], style: string): DimensionResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const affinities = items.map((item) => itemStyleAffinity(item, style));
  const average = affinities.reduce((sum, value) => sum + value, 0) / affinities.length;
  const best = Math.max(...affinities);
  // Soft: one strong anchor can carry a weakly tagged set.
  let score = average * 0.7 + best * 0.3;

  const clusters = new Set(items.map(itemCluster).filter((cluster): cluster is keyof typeof STYLE_CLUSTERS => cluster !== null));
  const requested = attrKey(style);
  const runwayMix = requested === 'runway';
  if (clusters.has('street') && clusters.has('prep') && !runwayMix) {
    score -= 18;
    issues.push('The outfit has weak visual connection to the requested style.');
    suggestions.push('Keep street and tailored pieces from competing — pick one direction.');
  }
  if (average < 48) {
    issues.push('The outfit has weak visual connection to the requested style.');
    suggestions.push('Lean on pieces whose tags or cuts match the requested vibe.');
  }

  return { score: clamp100(score), issues: unique(issues), suggestions: unique(suggestions) };
}

function scoreColor(items: OutfitScoreItem[], style: string): DimensionResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const tokens = items.flatMap(extractColorTokens);
  if (!tokens.length) {
    return { score: NEUTRAL_DIMENSION, issues, suggestions };
  }

  const neutrals = tokens.filter((token) => token.kind === 'neutral');
  const chromatic = tokens.filter((token) => token.kind === 'chromatic');
  const families = [...new Set(chromatic.map((token) => token.family).filter((family): family is ColorFamily => Boolean(family)))];
  const saturated = chromatic.filter((token) => token.saturated);
  const boldOk = styleKeys(style).some((tag) => ['y2k', 'runway', 'streetwear'].includes(attrKey(tag)));

  let score = 82;
  if (families.length === 0) score = 94;
  else if (families.length === 1) score = neutrals.length ? 92 : 84;
  else if (families.length === 2) {
    const [a, b] = families;
    if (complementary(a, b) || analogous(a, b)) score = 88;
    else score = 74;
  } else if (families.length === 3) {
    score = saturated.length >= 2 ? 42 : 58;
    issues.push('Color palette has too many competing saturated colors.');
    suggestions.push('Reduce the number of competing colors.');
  } else {
    score = 34;
    issues.push('Color palette has too many competing saturated colors.');
    suggestions.push('Reduce the number of competing colors.');
  }

  if (saturated.length >= 3 && !boldOk) {
    score -= 22;
    if (!issues.includes('Color palette has too many competing saturated colors.')) {
      issues.push('Color palette has too many competing saturated colors.');
    }
    suggestions.push('Use a neutral bottom to let one saturated piece act as the accent.');
  } else if (saturated.length >= 3 && boldOk) {
    score -= 8;
  }

  if (families.length === 1 && neutrals.length >= 1 && chromatic.length === 1) {
    score = Math.max(score, 90);
  }

  return { score: clamp100(score), issues: unique(issues), suggestions: unique(suggestions) };
}

function scoreSkinTone(
  items: OutfitScoreItem[],
  skinTone: SkinTonePreference | null | undefined,
): DimensionResult {
  if (!skinTone) {
    return { score: NEUTRAL_DIMENSION, issues: [], suggestions: [] };
  }
  const guide = SKIN_TONE_COLORS[skinTone];
  const tokens = items.flatMap(extractColorTokens);
  if (!tokens.length) {
    return { score: NEUTRAL_DIMENSION, issues: [], suggestions: [] };
  }

  const labels = tokens.map((token) => token.label);
  const preferHits = labels.filter((label) =>
    guide.prefer.some((prefer) => label.includes(prefer) || prefer.includes(label)),
  ).length;
  const avoidHits = labels.filter((label) =>
    guide.avoid.some((avoid) => label.includes(avoid) || avoid.includes(label)),
  ).length;
  const chromatic = tokens.filter((token) => token.kind === 'chromatic');
  const avoidDominant = avoidHits > preferHits && avoidHits >= 2;
  const preferDominant = preferHits >= avoidHits;

  let score = 72;
  if (preferDominant && preferHits > 0) score += Math.min(18, preferHits * 6);
  if (avoidHits === 1 && preferHits >= 1) score -= 6;
  if (avoidDominant) score -= 16;
  if (chromatic.length === 0 && preferHits > 0) score += 6;

  const issues: string[] = [];
  const suggestions: string[] = [];
  if (avoidDominant) {
    issues.push('The outfit palette sits awkwardly on the selected skin tone.');
    suggestions.push('Shift the palette toward colors that flatter this complexion.');
  }
  return { score: clamp100(score), issues, suggestions };
}

function volumeOf(item: OutfitScoreItem): number | null {
  const values: number[] = [];
  const fit = item.fit && item.fit !== 'unknown' ? item.fit : null;
  const sil = item.silhouette && item.silhouette !== 'unknown' ? item.silhouette : null;
  const map: Record<string, number> = {
    skinny: 1,
    slim: 2,
    fitted: 2,
    bodycon: 2,
    regular: 3,
    straight: 3,
    relaxed: 4,
    a_line: 4,
    loose: 5,
    boxy: 5,
    oversized: 5,
    baggy: 6,
    wide_leg: 6,
  };
  if (fit && map[fit] != null) values.push(map[fit]);
  if (sil && map[sil] != null) values.push(map[sil]);
  const text = itemText(item);
  if (/\bbaggy\b|\bwide[- ]leg\b/.test(text)) values.push(6);
  if (/\boversized\b|\bboxy\b/.test(text)) values.push(5);
  if (/\bskinny\b/.test(text)) values.push(1);
  if (!values.length) return null;
  return Math.max(...values);
}

function isCropped(item: OutfitScoreItem): boolean {
  return item.silhouette === 'cropped' || /\bcrop(?:ped)?\b|\bbaby\s+tee\b/.test(itemText(item));
}

function byCategory(items: OutfitScoreItem[], category: string): OutfitScoreItem | undefined {
  return items.find((item) => item.category === category);
}

function scoreProportion(items: OutfitScoreItem[], style: string): DimensionResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const top = byCategory(items, 'top');
  const bottom = byCategory(items, 'bottom');
  const topVol = top ? volumeOf(top) : null;
  const bottomVol = bottom ? volumeOf(bottom) : null;

  if (topVol == null && bottomVol == null) {
    return { score: NEUTRAL_DIMENSION, issues, suggestions };
  }

  let score = 78;
  const volumeFriendly = requestedStyleFriendlyVolume(style);
  const narrowFriendly = requestedStyleFriendlyNarrow(style);

  if (topVol != null && bottomVol != null) {
    if (topVol >= 5 && bottomVol >= 5) {
      if (volumeFriendly) score += 6;
      else {
        score -= 20;
        issues.push('Top and bottom create excessive volume.');
        suggestions.push('Swap the wide-leg bottom for a straight or relaxed silhouette.');
      }
    } else if (topVol <= 2 && bottomVol <= 2) {
      if (narrowFriendly) score += 6;
      else {
        score -= 10;
        issues.push('Top and bottom are both very narrow.');
      }
    } else if (topVol >= 5 && bottomVol <= 3) {
      score += 12;
    } else if (topVol <= 2 && bottomVol >= 5) {
      score += 12;
    } else {
      score += 6;
    }
  }

  if (top && isCropped(top) && bottomVol != null && bottomVol >= 5) {
    score += 6;
  }

  const outer = byCategory(items, 'outerwear');
  const outerVol = outer ? volumeOf(outer) : null;
  if (outerVol != null && topVol != null && outerVol >= 5 && topVol >= 5 && !volumeFriendly) {
    score -= 8;
  }

  return { score: clamp100(score), issues, suggestions };
}

const FORMALITY_RANK: Record<string, number> = {
  athletic: 0,
  casual: 1,
  smart_casual: 2,
  formal: 3,
};

function inferredFormality(item: OutfitScoreItem): FormalityAttr | null {
  if (item.formality && item.formality !== 'unknown') {
    return item.formality as FormalityAttr;
  }
  const text = itemText(item);
  const sub = (item.subcategory ?? '').toLowerCase();
  if (looksLikeDressFootwear(item) || sub === 'loafers' || sub === 'heels' || /\bblazer\b|\btrouser/.test(text)) {
    return 'formal';
  }
  if (/\brunning\b|\btraining\b|\bjoggers?\b|\bleggings?\b/.test(text) || sub === 'sneakers' && /\brunning\b/.test(text)) {
    return 'athletic';
  }
  if (sub === 'hoodie' || sub === 't-shirt' || sub === 'sneakers' || /\bgraphic\b|\bhoodie\b/.test(text)) {
    return 'casual';
  }
  if (sub === 'chino' || sub === 'shirt' || sub === 'polo' || /\bchino\b|\boxford\b/.test(text)) {
    return 'smart_casual';
  }
  return null;
}

function scoreOccasion(items: OutfitScoreItem[], style: string, occasion: string): DimensionResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const ranks = items
    .map(inferredFormality)
    .filter((value): value is FormalityAttr => value != null)
    .map((value) => FORMALITY_RANK[value])
    .filter((value) => Number.isFinite(value));

  let score = NEUTRAL_DIMENSION;
  if (ranks.length >= 2) {
    const spread = Math.max(...ranks) - Math.min(...ranks);
    score = spread === 0 ? 90 : spread === 1 ? 80 : spread === 2 ? 52 : 34;
    if (spread >= 2) {
      const shoes = byCategory(items, 'shoes');
      if (shoes && looksLikeDressFootwear(shoes) && Math.min(...ranks) <= 1) {
        issues.push('Footwear is significantly more formal than the rest of the outfit.');
        suggestions.push('Replace the dress shoe with a casual sneaker.');
      } else {
        issues.push('Formality is inconsistent across the outfit.');
      }
    }
  }

  const accepted = occasionFormality(occasion);
  const known = items.map(inferredFormality).filter((value): value is FormalityAttr => value != null);
  if (known.length && !known.some((value) => accepted.includes(value))) {
    score -= 12;
    issues.push('Outfit formality does not match the requested occasion.');
  }

  const shoes = byCategory(items, 'shoes');
  if (shoes && looksLikeDressFootwear(shoes) && !isClassyLook(style, occasion)) {
    const rest = items.filter((item) => item.category !== 'shoes').map(inferredFormality);
    const restCasual = rest.some((value) => value === 'casual' || value === 'athletic');
    if (restCasual) {
      score -= 14;
      if (!issues.includes('Footwear is significantly more formal than the rest of the outfit.')) {
        issues.push('Footwear is significantly more formal than the rest of the outfit.');
      }
      suggestions.push('Replace the dress shoe with a casual sneaker.');
    }
  }

  return { score: clamp100(score), issues: unique(issues), suggestions: unique(suggestions) };
}

function readNumber(measurements: Record<string, number | string> | null | undefined, key: string): number | null {
  const value = measurements?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function scoreFit(items: OutfitScoreItem[], measurements: Record<string, number | string> | null | undefined): DimensionResult {
  const height = readNumber(measurements, 'height_cm');
  const weight = readNumber(measurements, 'weight_kg');
  const inseam = readNumber(measurements, 'inseam_cm');
  const waist = readNumber(measurements, 'waist_cm');
  const hips = readNumber(measurements, 'hips_cm');
  const hasAny = [height, weight, inseam, waist, hips].some((value) => value != null);
  if (!hasAny) {
    return { score: NEUTRAL_DIMENSION, issues: [], suggestions: [] };
  }

  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = NEUTRAL_DIMENSION;
  const top = byCategory(items, 'top');
  const bottom = byCategory(items, 'bottom');
  const topVol = top ? volumeOf(top) : null;
  const bottomVol = bottom ? volumeOf(bottom) : null;

  if (height != null && height < 162 && topVol != null && bottomVol != null && topVol >= 5 && bottomVol >= 5) {
    score -= 8;
    issues.push('Stacked volume may overwhelm a shorter frame.');
    suggestions.push('Keep one piece slimmer so the silhouette stays balanced.');
  }
  if (height != null && height > 188 && top && isCropped(top)) {
    score -= 6;
    suggestions.push('A slightly longer top may sit better on a taller frame.');
  }
  if (inseam != null && inseam < 72 && bottomVol != null && bottomVol >= 6) {
    score -= 5;
  }
  if (inseam != null && inseam > 86 && bottom && isCropped(bottom)) {
    score -= 5;
  }

  // Height + weight only: stay conservative — no BMI-as-size claims.
  if (height != null && weight != null && inseam == null && waist == null) {
    score = Math.max(score, 66);
  }

  return { score: clamp100(score), issues, suggestions };
}

function seasonHint(item: OutfitScoreItem): SeasonAttr[] {
  const tags = (item.season_tags ?? []).map(attrKey) as SeasonAttr[];
  const known = tags.filter((tag) => ['spring', 'summer', 'fall', 'winter', 'all_season'].includes(tag));
  if (known.length) return known;
  const text = itemText(item);
  const sub = (item.subcategory ?? '').toLowerCase();
  const material = (item.material ?? '').toLowerCase();
  const hints: SeasonAttr[] = [];
  if (['wool', 'cashmere', 'fleece', 'merino'].includes(material) || sub === 'puffer' || sub === 'coat') {
    hints.push('winter');
  }
  if (material === 'linen' || sub === 'shorts' || sub === 'sandals' || sub === 'tank') {
    hints.push('summer');
  }
  if (/\bpuffer\b|\bparka\b/.test(text)) hints.push('winter');
  if (/\blinen\b|\bsandal/.test(text)) hints.push('summer');
  return hints;
}

function scoreSeason(items: OutfitScoreItem[], season: SeasonAttr): DimensionResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const opposite: Record<SeasonAttr, SeasonAttr> = {
    winter: 'summer',
    summer: 'winter',
    spring: 'fall',
    fall: 'spring',
    all_season: 'all_season',
  };
  const hints = items.map(seasonHint);
  if (hints.every((list) => list.length === 0)) {
    return { score: NEUTRAL_DIMENSION, issues, suggestions };
  }

  let matches = 0;
  let conflicts = 0;
  for (const list of hints) {
    if (!list.length) continue;
    if (list.includes('all_season') || list.includes(season)) matches += 1;
    else if (list.includes(opposite[season])) conflicts += 1;
  }

  let score = 74 + matches * 6 - conflicts * 16;
  if (conflicts >= 2) {
    issues.push('Season tags are inconsistent across the outfit.');
    suggestions.push('Swap the off-season piece for something in the current season.');
  }
  return { score: clamp100(score), issues, suggestions };
}

function scoreCohesion(items: OutfitScoreItem[], style: string): DimensionResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 72;

  const aesthetics = items.flatMap((item) => (item.aesthetic_tags ?? []).map(attrKey));
  const uniqueAesthetics = new Set(aesthetics.filter((tag) => tag && tag !== 'unknown'));
  if (uniqueAesthetics.size === 1 && aesthetics.length >= 2) score += 10;
  else if (uniqueAesthetics.size >= 3) score -= 8;

  const families = [
    ...new Set(
      items
        .flatMap(extractColorTokens)
        .map((token) => token.family)
        .filter((family): family is ColorFamily => Boolean(family)),
    ),
  ];
  const neutrals = items.flatMap(extractColorTokens).filter((token) => token.kind === 'neutral');
  if (families.length <= 1 && neutrals.length >= 2) score += 8;
  if (families.length >= 3) score -= 8;

  const materials = items
    .map((item) => (item.material ?? '').toLowerCase())
    .filter((material) => material && material !== 'unknown');
  const athleticMat = materials.some((material) => ['nylon', 'polyester', 'fleece'].includes(material));
  const tailoredMat = materials.some((material) => ['wool', 'cashmere', 'silk', 'merino'].includes(material));
  if (athleticMat && tailoredMat) {
    score -= 10;
    issues.push('Several pieces compete for attention instead of having a clear focal point.');
  }

  const loud = items.filter((item) => item.pattern && LOUD_PATTERNS.has(item.pattern));
  if (loud.length >= 2) {
    score -= 12;
    issues.push('Several pieces compete for attention instead of having a clear focal point.');
    suggestions.push('Keep one patterned piece and let the others stay quieter.');
  }

  const shoes = byCategory(items, 'shoes');
  const aliases = styleKeys(style).map(attrKey);
  if (shoes) {
    const dress = looksLikeDressFootwear(shoes);
    const sneaker = (shoes.subcategory ?? '').toLowerCase() === 'sneakers' || /\bsneaker/.test(itemText(shoes));
    if (dress && aliases.some((tag) => ['old_money', 'formal', 'quiet_luxury', 'preppy'].includes(tag))) {
      score += 8;
    }
    if (sneaker && aliases.some((tag) => ['streetwear', 'athleisure', 'casual', 'y2k'].includes(tag))) {
      score += 8;
    }
    if (dress && aliases.some((tag) => ['streetwear', 'athleisure'].includes(tag))) {
      score -= 14;
      issues.push('Footwear is significantly more formal than the rest of the outfit.');
      suggestions.push('Replace the dress shoe with a casual sneaker.');
    }
  }

  const optional = items.filter((item) => item.category === 'outerwear' || item.category === 'accessory');
  for (const piece of optional) {
    const affinity = itemStyleAffinity(piece, style);
    if (affinity < 45) {
      score -= 6;
      issues.push('An extra piece is not pulling its weight in the outfit.');
    } else {
      score += 4;
    }
  }

  return { score: clamp100(score), issues: unique(issues), suggestions: unique(suggestions) };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function scoreOutfit(
  items: readonly OutfitScoreItem[],
  context: OutfitScoringContext,
): OutfitScore {
  if (!items.length) {
    return {
      score: 0,
      breakdown: {
        style: 0,
        color: 0,
        proportion: 0,
        skinTone: 0,
        occasion: 0,
        fit: 0,
        season: 0,
        cohesion: 0,
      },
      issues: ['No pieces to score.'],
      suggestions: [],
    };
  }

  const season = context.season ?? currentSeason();
  const style = scoreStyle([...items], context.style);
  const color = scoreColor([...items], context.style);
  const proportion = scoreProportion([...items], context.style);
  const skinTone = scoreSkinTone([...items], context.skinTone);
  const occasion = scoreOccasion([...items], context.style, context.occasion);
  const fit = scoreFit([...items], context.measurements);
  const seasonScore = scoreSeason([...items], season);
  const cohesion = scoreCohesion([...items], context.style);

  const breakdown: OutfitScoreBreakdown = {
    style: Math.round(style.score),
    color: Math.round(color.score),
    proportion: Math.round(proportion.score),
    skinTone: Math.round(skinTone.score),
    occasion: Math.round(occasion.score),
    fit: Math.round(fit.score),
    season: Math.round(seasonScore.score),
    cohesion: Math.round(cohesion.score),
  };

  const score = Math.round(
    breakdown.style * OUTFIT_SCORE_WEIGHTS.style +
      breakdown.color * OUTFIT_SCORE_WEIGHTS.color +
      breakdown.proportion * OUTFIT_SCORE_WEIGHTS.proportion +
      breakdown.skinTone * OUTFIT_SCORE_WEIGHTS.skinTone +
      breakdown.occasion * OUTFIT_SCORE_WEIGHTS.occasion +
      breakdown.fit * OUTFIT_SCORE_WEIGHTS.fit +
      breakdown.season * OUTFIT_SCORE_WEIGHTS.season +
      breakdown.cohesion * OUTFIT_SCORE_WEIGHTS.cohesion,
  );

  const rawIssues = [
    ...style.issues,
    ...color.issues,
    ...proportion.issues,
    ...skinTone.issues,
    ...occasion.issues,
    ...fit.issues,
    ...seasonScore.issues,
    ...cohesion.issues,
  ];
  const rawSuggestions = [
    ...style.suggestions,
    ...color.suggestions,
    ...proportion.suggestions,
    ...skinTone.suggestions,
    ...occasion.suggestions,
    ...fit.suggestions,
    ...seasonScore.suggestions,
    ...cohesion.suggestions,
  ];

  // Strong outfits stay quiet — no filler copy.
  const strong = score >= 78;
  return {
    score,
    breakdown,
    issues: strong ? [] : unique(rawIssues),
    suggestions: strong ? [] : unique(rawSuggestions),
  };
}
