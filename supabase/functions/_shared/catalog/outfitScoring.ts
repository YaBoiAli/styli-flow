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
import {
  colorPlacementWeight,
  isNeutralColorFamily,
  resolvedFit,
  resolvedPattern,
  resolvedSilhouette,
  visualIsUsable,
  type VisualAttributes,
} from './visualAttributes.ts';

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
  visual_attributes?: VisualAttributes | null;
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
  /** Absent defaults to include. */
  footwearPreference?: 'include' | 'none';
  /**
   * `complexion` uses the user's complexion as one color factor.
   * Default `style_first` keeps general styling (does not force complexion matching).
   */
  colorPreference?: 'complexion' | 'style_first';
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
  fit: 0.05,
  season: 0.05,
  cohesion: 0.1,
} as const;

/** Inapplicable optional dimension (complexion off, no measurements). Not unknown evidence. */
const NEUTRAL_DIMENSION = 70;
/** Missing product metadata. Neither a match nor a miss. */
export const UNCERTAIN_DIMENSION = 50;
const LOUD_PATTERNS = new Set(['graphic', 'floral', 'plaid', 'camo', 'animal', 'logo', 'abstract']);
const INTENSITY_FRIENDLY_STYLES = new Set([
  'streetwear',
  'elevated_streetwear',
  'elevated streetwear',
  'y2k',
  'grunge',
  'runway',
]);
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

function tokenFromParts(params: {
  label: string;
  family?: ColorFamily;
  kind?: 'neutral' | 'chromatic';
  saturated?: boolean;
}): ColorToken {
  return {
    label: params.label,
    kind: params.kind ?? (params.family ? 'chromatic' : 'neutral'),
    family: params.family,
    saturated: Boolean(params.saturated),
  };
}

function familyFromVisual(family: string | null | undefined): ColorFamily | undefined {
  if (!family || isNeutralColorFamily(family) || family === 'navy') return undefined;
  if (family === 'gold') return 'yellow';
  if (
    family === 'red' ||
    family === 'orange' ||
    family === 'yellow' ||
    family === 'green' ||
    family === 'blue' ||
    family === 'purple' ||
    family === 'pink'
  ) {
    return family;
  }
  return undefined;
}

function tokensFromVisual(item: OutfitScoreItem): ColorToken[] | null {
  const visual = item.visual_attributes;
  if (!visualIsUsable(item) || !visual) return null;
  if (!visual.primary_color && !visual.color_family) return null;

  const saturated =
    visual.saturation === 'high' ||
    /\bneon\b|\belectric\b|\bbright\b/.test(visual.primary_color ?? '');
  const family = familyFromVisual(visual.color_family);
  const kind: 'neutral' | 'chromatic' =
    family && visual.color_family !== 'navy' ? 'chromatic' : 'neutral';
  const label = (visual.primary_color ?? visual.color_family ?? 'color').toLowerCase();
  const found: ColorToken[] = [
    tokenFromParts({ label, family, kind, saturated: kind === 'chromatic' && saturated }),
  ];
  const seen = new Set([label]);
  for (const extra of visual.secondary_colors) {
    if (seen.has(extra)) continue;
    seen.add(extra);
    const fromLexicon = tokensFromLexicon(extra);
    if (fromLexicon.length) found.push(...fromLexicon);
  }
  return found;
}

function tokensFromLexicon(text: string): ColorToken[] {
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

export function extractColorTokens(item: OutfitScoreItem): ColorToken[] {
  const visualTokens = tokensFromVisual(item);
  if (visualTokens?.length) return visualTokens;
  return tokensFromLexicon(colorText(item));
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
  const visualAesthetics = visualIsUsable(item) ? (item.visual_attributes?.aesthetics ?? []) : [];
  const tags = [
    ...(item.style_tags ?? []),
    ...(item.aesthetic_tags ?? []),
    ...visualAesthetics,
  ].map(attrKey);
  const aliasKeys = aliases.map(attrKey);
  let evidence = 0;
  let hasEvidence = false;
  if (tags.some((tag) => aliasKeys.includes(tag) || (tag === 'minimal' && aliasKeys.includes('minimalist')))) {
    evidence += 30;
    hasEvidence = true;
  }
  const fitKey = resolvedFit(item);
  const silKey = resolvedSilhouette(item);
  for (const alias of aliases) {
    const key = attrKey(alias);
    if (fitKey && (STYLE_FIT[alias] ?? STYLE_FIT[key] ?? []).includes(fitKey)) {
      evidence += 10;
      hasEvidence = true;
    }
    if (silKey && (STYLE_SILHOUETTE[alias] ?? STYLE_SILHOUETTE[key] ?? []).includes(silKey)) {
      evidence += 10;
      hasEvidence = true;
    }
  }
  const text = itemText(item);
  for (const [index, alias] of aliases.entries()) {
    const hits = keywordHits(text, STYLE_KEYWORDS[alias] ?? STYLE_KEYWORDS[attrKey(alias)] ?? []);
    if (hits) {
      evidence += Math.min(index === 0 ? hits * 6 : hits * 3, 18);
      hasEvidence = true;
    }
  }
  if (!hasEvidence) return UNCERTAIN_DIMENSION;
  return clamp100(UNCERTAIN_DIMENSION + evidence);
}

export function productStyleAffinity(item: OutfitScoreItem, style: string): number {
  return itemStyleAffinity(item, style);
}

const STYLE_CLUSTERS = {
  street: ['streetwear', 'elevated_streetwear', 'athleisure', 'grunge'],
  prep: ['old_money', 'quiet_luxury', 'preppy', 'formal', 'dark_academia'],
  y2k: ['y2k'],
} as const;

function itemCluster(item: OutfitScoreItem): keyof typeof STYLE_CLUSTERS | null {
  const visualAesthetics = visualIsUsable(item) ? (item.visual_attributes?.aesthetics ?? []) : [];
  const tags = [...(item.style_tags ?? []), ...(item.aesthetic_tags ?? []), ...visualAesthetics].map(attrKey);
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
  const worst = Math.min(...affinities);
  // Soft: one strong anchor can carry a weakly tagged set.
  let score = average * 0.7 + best * 0.3;

  const clusters = new Set(items.map(itemCluster).filter((cluster): cluster is keyof typeof STYLE_CLUSTERS => cluster !== null));
  const requested = attrKey(style);
  const runwayMix = requested === 'runway';
  if (clusters.has('street') && clusters.has('prep') && !runwayMix) {
    score -= 22;
    issues.push('The outfit has weak visual connection to the requested style.');
    suggestions.push('Keep street and tailored pieces from competing — pick one direction.');
  }
  if (average < 48) {
    issues.push('The outfit has weak visual connection to the requested style.');
    suggestions.push('Lean on pieces whose tags or cuts match the requested vibe.');
  }
  if (best < 58 && average < 55) {
    score -= 12;
    issues.push('The pieces do not read as one intentional outfit.');
    suggestions.push('Choose a main piece and support it instead of averaging unrelated items.');
  }
  if (best >= 70 && worst >= 48) score += 6;

  return { score: clamp100(score), issues: unique(issues), suggestions: unique(suggestions) };
}

function requestedStyleFriendlyIntensity(style: string): boolean {
  const keys = styleKeys(style).map((tag) => attrKey(tag));
  return keys.some(
    (key) => INTENSITY_FRIENDLY_STYLES.has(key) || INTENSITY_FRIENDLY_STYLES.has(key.replace(/_/g, ' ')),
  );
}

function scoreColor(
  items: OutfitScoreItem[],
  style: string,
  footwearPreference: 'include' | 'none' | undefined,
): DimensionResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const tokens = items.flatMap(extractColorTokens);
  if (!tokens.length) {
    return { score: UNCERTAIN_DIMENSION, issues, suggestions };
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

  const visualItems = items.filter(visualIsUsable);
  if (visualItems.length) {
    const saturations = visualItems
      .map((item) => item.visual_attributes?.saturation)
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const brightnesses = visualItems
      .map((item) => item.visual_attributes?.brightness)
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const highSatNearFace = visualItems.filter((item) => {
      const weight = colorPlacementWeight(item.category, footwearPreference);
      return weight >= 0.7 && item.visual_attributes?.saturation === 'high';
    }).length;
    const highSatCount = saturations.filter((value) => value === 'high').length;
    if (highSatCount >= 2 && !boldOk) {
      score -= 10;
      issues.push('Color palette has too many competing saturated colors.');
      suggestions.push('Keep one saturated piece near the face and mute the rest.');
    } else if (highSatNearFace >= 1 && !boldOk) {
      score -= 8;
    } else if (highSatNearFace === 1 && saturations.some((value) => value === 'low') && boldOk) {
      score += 4;
    }
    if (brightnesses.includes('dark') && brightnesses.includes('light') && highSatCount >= 2 && !boldOk) {
      score -= 6;
    }
    const shoeItem = items.find((item) => item.category === 'shoes');
    if (footwearPreference !== 'none' && shoeItem && visualIsUsable(shoeItem)) {
      const shoeChromatic = extractColorTokens(shoeItem).some((token) => token.kind === 'chromatic');
      const coreFamilies = items
        .filter((item) => item.category !== 'shoes')
        .flatMap(extractColorTokens)
        .filter((token) => token.kind === 'chromatic');
      if (shoeChromatic && new Set(coreFamilies.map((token) => token.family)).size <= 1) {
        score += 3;
      }
    }
  }

  return { score: clamp100(score), issues: unique(issues), suggestions: unique(suggestions) };
}

const COMPLEXION_DEPTH: Record<SkinTonePreference, 'light' | 'mid' | 'deep'> = {
  fair: 'light',
  light: 'light',
  medium: 'mid',
  tan: 'mid',
  deep: 'deep',
  rich: 'deep',
};

function scoreSkinTone(
  items: OutfitScoreItem[],
  skinTone: SkinTonePreference | null | undefined,
  footwearPreference: 'include' | 'none' | undefined,
  colorPreference: 'complexion' | 'style_first' | undefined,
): DimensionResult {
  if (!skinTone || colorPreference !== 'complexion') {
    return { score: NEUTRAL_DIMENSION, issues: [], suggestions: [] };
  }
  const guide = SKIN_TONE_COLORS[skinTone];
  const depth = COMPLEXION_DEPTH[skinTone];
  const scored = items.flatMap((item) => {
    const weight = colorPlacementWeight(item.category, footwearPreference);
    if (weight <= 0) return [];
    const visual = visualIsUsable(item) ? item.visual_attributes : null;
    const labels = [
      ...extractColorTokens(item).map((token) => token.label),
      ...(visual ? skinToneVisualAliases(visual) : []),
    ];
    if (!labels.length) return [];
    return [{ item, weight, visual, labels }];
  });
  if (!scored.length) {
    return { score: UNCERTAIN_DIMENSION, issues: [], suggestions: [] };
  }

  let weighted = 0;
  let totalWeight = 0;
  let avoidUpper = 0;
  let preferUpper = 0;
  for (const entry of scored) {
    const joined = entry.labels.join(' ');
    const preferHits = entry.labels.filter((label) =>
      guide.prefer.some((prefer) => label.includes(prefer) || prefer.includes(label)),
    ).length;
    const avoidHits = entry.labels.filter((label) =>
      guide.avoid.some((avoid) => label.includes(avoid) || avoid.includes(label)),
    ).length;
    let local = 70;
    if (preferHits > 0) local += Math.min(16, preferHits * 8);
    if (avoidHits > 0) local -= Math.min(22, avoidHits * 12);

    const sat = entry.visual?.saturation ?? null;
    const brightness = entry.visual?.brightness ?? null;
    const family = entry.visual?.color_family ?? null;
    const wash = complexionWashesOut(depth, joined, sat, brightness, family);
    const contrast = complexionUsefulContrast(depth, joined, brightness, family);
    if (wash) local -= 14;
    else if (contrast && avoidHits === 0) local += 8;
    if (sat === 'high' && avoidHits > 0) local -= 6;
    if (sat === 'low' && preferHits > 0 && !wash) local += 3;

    weighted += clamp100(local) * entry.weight;
    totalWeight += entry.weight;
    if (entry.item.category === 'top' || entry.item.category === 'outerwear') {
      if (avoidHits > 0 || wash) avoidUpper += entry.weight;
      if (preferHits > 0 && avoidHits === 0) preferUpper += entry.weight;
    }
  }

  let score = totalWeight > 0 ? weighted / totalWeight : NEUTRAL_DIMENSION;
  if (avoidUpper > preferUpper && avoidUpper >= 0.8) score -= 8;
  if (preferUpper >= 1 && avoidUpper === 0) score += 4;

  const issues: string[] = [];
  const suggestions: string[] = [];
  if (score < 58) {
    issues.push('The outfit palette sits awkwardly on the selected complexion.');
    suggestions.push('Shift the upper-body colors toward shades that complement this complexion.');
  }
  return { score: clamp100(score), issues, suggestions };
}

function complexionWashesOut(
  depth: 'light' | 'mid' | 'deep',
  labels: string,
  saturation: string | null,
  brightness: string | null,
  family: string | null,
): boolean {
  const muted = saturation !== 'high';
  if (depth === 'light') {
    if (/\b(peach|beige|nude|yellow|camel)\b/.test(labels) && muted) return true;
    if ((family === 'orange' || family === 'yellow') && brightness === 'light' && muted) return true;
  }
  if (depth === 'mid') {
    if (/\b(muddy|grey|gray)\b/.test(labels)) return true;
    if (family === 'gray' && saturation === 'low') return true;
  }
  if (depth === 'deep') {
    if (/\b(beige|khaki|brown|tan)\b/.test(labels) && muted) return true;
    if ((family === 'brown' || family === 'beige') && brightness === 'dark' && muted) return true;
  }
  return false;
}

function complexionUsefulContrast(
  depth: 'light' | 'mid' | 'deep',
  labels: string,
  brightness: string | null,
  family: string | null,
): boolean {
  if (depth === 'light') {
    return brightness === 'dark' || family === 'navy' || family === 'black' || /\b(navy|charcoal|burgundy|forest)\b/.test(labels);
  }
  if (depth === 'deep') {
    return (
      brightness === 'light' ||
      family === 'white' ||
      family === 'cream' ||
      family === 'gold' ||
      /\b(white|ivory|cream|gold|cobalt|emerald)\b/.test(labels)
    );
  }
  return brightness === 'dark' || brightness === 'light';
}

function skinToneVisualAliases(visual: NonNullable<OutfitScoreItem['visual_attributes']>): string[] {
  const aliases: string[] = [];
  const family = visual.color_family;
  const sat = visual.saturation;
  const brightness = visual.brightness;
  if (family === 'blue' && (sat === 'low' || brightness === 'dark')) aliases.push('navy');
  if (family === 'blue' && sat === 'high') aliases.push('cobalt');
  if (family === 'green' && (sat === 'low' || brightness === 'dark')) aliases.push('olive', 'forest');
  if (family === 'green' && sat === 'high') aliases.push('emerald');
  if (family === 'red' && sat === 'low') aliases.push('burgundy', 'wine');
  if (family === 'red' && sat === 'high') aliases.push('red');
  if (family === 'navy') aliases.push('navy');
  if (family === 'black') aliases.push('black');
  if (family === 'white' || family === 'cream') aliases.push('white', 'ivory', 'cream');
  if (family === 'orange' && sat === 'high') aliases.push('orange');
  if (family === 'yellow' && sat === 'high') aliases.push('yellow');
  if (visual.primary_color) aliases.push(visual.primary_color);
  return aliases;
}

function volumeOf(item: OutfitScoreItem): number | null {
  const values: number[] = [];
  const fit = resolvedFit(item);
  const sil = resolvedSilhouette(item);
  const map: Record<string, number> = {
    skinny: 1,
    slim: 2,
    fitted: 2,
    bodycon: 2,
    regular: 3,
    straight: 3,
    structured: 3,
    relaxed: 4,
    a_line: 4,
    loose: 5,
    boxy: 5,
    oversized: 5,
    baggy: 6,
    wide: 6,
    wide_leg: 6,
  };
  if (fit && map[fit] != null) values.push(map[fit]);
  if (sil && map[sil] != null) values.push(map[sil]);
  if (visualIsUsable(item)) {
    const weight = item.visual_attributes?.visual_weight;
    if (weight === 'light') values.push(2);
    if (weight === 'medium') values.push(3);
    if (weight === 'heavy') values.push(5);
    const length = item.visual_attributes?.length;
    if (length === 'long' && item.category === 'top') values.push(4);
  }
  const text = itemText(item);
  if (/\bbaggy\b|\bwide[- ]leg\b/.test(text)) values.push(6);
  if (/\boversized\b|\bboxy\b/.test(text)) values.push(5);
  if (/\bskinny\b/.test(text)) values.push(1);
  if (!values.length) return null;
  return Math.max(...values);
}

function isCropped(item: OutfitScoreItem): boolean {
  const sil = resolvedSilhouette(item);
  const length = visualIsUsable(item) ? item.visual_attributes?.length : null;
  return sil === 'cropped' || length === 'cropped' || /\bcrop(?:ped)?\b|\bbaby\s+tee\b/.test(itemText(item));
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
    return { score: UNCERTAIN_DIMENSION, issues, suggestions };
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

  let score = UNCERTAIN_DIMENSION;
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
    return { score: UNCERTAIN_DIMENSION, issues, suggestions };
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

function scoreWearability(
  items: OutfitScoreItem[],
  style: string,
  occasion: string,
): DimensionResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 70;

  const clusters = new Set(
    items.map(itemCluster).filter((cluster): cluster is keyof typeof STYLE_CLUSTERS => cluster !== null),
  );
  const requested = attrKey(style);
  if (clusters.has('street') && clusters.has('prep') && requested !== 'runway') {
    score -= 24;
    issues.push('These pieces would not realistically be worn together.');
    suggestions.push('Rebuild around one aesthetic instead of mixing competing directions.');
  }

  const ranks = items
    .map(inferredFormality)
    .filter((value): value is FormalityAttr => value != null)
    .map((value) => FORMALITY_RANK[value])
    .filter((value) => Number.isFinite(value));
  if (ranks.length >= 2) {
    const spread = Math.max(...ranks) - Math.min(...ranks);
    if (spread >= 2) {
      score -= 16;
      issues.push('The silhouette and formality combination is not believable as one outfit.');
    }
  }

  const affinities = items.map((item) => itemStyleAffinity(item, style));
  const best = Math.max(...affinities);
  const average = affinities.reduce((sum, value) => sum + value, 0) / affinities.length;
  if (best >= 72 && average >= 55) score += 10;
  if (best < 55) {
    score -= 10;
    issues.push('The outfit feels generic rather than styled for this request.');
  }

  const loud = items.filter((item) => {
    const pattern = resolvedPattern(item);
    const intensity = visualIsUsable(item) ? item.visual_attributes?.visual_intensity : null;
    return Boolean(pattern && LOUD_PATTERNS.has(pattern)) || (typeof intensity === 'number' && intensity >= 7);
  });
  const quiet = items.length - loud.length;
  if (loud.length === 1 && quiet >= 1) score += 8;
  if (loud.length >= 2 && !requestedStyleFriendlyIntensity(style)) score -= 10;

  const accepted = occasionFormality(occasion);
  const known = items.map(inferredFormality).filter((value): value is FormalityAttr => value != null);
  if (known.length && known.every((value) => !accepted.includes(value))) {
    score -= 8;
  }

  return { score: clamp100(score), issues: unique(issues), suggestions: unique(suggestions) };
}

function scoreCohesion(
  items: OutfitScoreItem[],
  style: string,
  footwearPreference: 'include' | 'none' | undefined,
): DimensionResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 64;

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

  const catalogLoud = items.filter((item) => {
    const pattern = resolvedPattern(item);
    return Boolean(pattern && LOUD_PATTERNS.has(pattern));
  });
  const visualItems = items.filter(visualIsUsable);
  if (!visualItems.length) {
    if (catalogLoud.length >= 2) {
      score -= 12;
      issues.push('Several pieces compete for attention instead of having a clear focal point.');
      suggestions.push('Keep one patterned piece and let the others stay quieter.');
    }
  } else {
    const loud = items.filter((item) => {
      const pattern = resolvedPattern(item);
      const intensity = item.visual_attributes?.pattern_intensity;
      const scale = item.visual_attributes?.pattern_scale;
      const visualIntensity = item.visual_attributes?.visual_intensity;
      const loudPattern = Boolean(pattern && LOUD_PATTERNS.has(pattern));
      return (
        loudPattern ||
        intensity === 'high' ||
        (scale === 'large' && loudPattern) ||
        (typeof visualIntensity === 'number' && visualIntensity >= 7)
      );
    });
    const intensityFriendly = requestedStyleFriendlyIntensity(style);
    if (loud.length >= 2) {
      const bothHigh =
        loud.filter((item) => {
          const intensity = item.visual_attributes?.pattern_intensity;
          const visualIntensity = item.visual_attributes?.visual_intensity;
          const scale = item.visual_attributes?.pattern_scale;
          return (
            intensity === 'high' ||
            scale === 'large' ||
            (typeof visualIntensity === 'number' && visualIntensity >= 7)
          );
        }).length >= 2;
      if (bothHigh && !intensityFriendly) {
        score -= 12;
        issues.push('Several pieces compete for attention instead of having a clear focal point.');
        suggestions.push('Keep one patterned piece and let the others stay quieter.');
      } else if (bothHigh && intensityFriendly) {
        score -= 4;
      } else if (!intensityFriendly) {
        const scales = loud.map((item) => item.visual_attributes?.pattern_scale).filter(Boolean);
        if (scales.includes('large') && scales.includes('small')) {
          score -= 4;
        } else {
          score -= 8;
          issues.push('Several pieces compete for attention instead of having a clear focal point.');
          suggestions.push('Keep one patterned piece and let the others stay quieter.');
        }
      }
    }
  }

  const appearances = items
    .map((item) => (visualIsUsable(item) ? item.visual_attributes?.material_appearance : null))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  const athleticLook = appearances.some((value) => value === 'technical' || value === 'fleece');
  const tailoredLook = appearances.some((value) => value === 'wool' || value === 'silky');
  if (athleticLook && tailoredLook) {
    score -= 8;
  }

  const visualAesthetics = items.flatMap((item) =>
    visualIsUsable(item) ? (item.visual_attributes?.aesthetics ?? []).map(attrKey) : [],
  );
  const uniqueVisual = new Set(visualAesthetics);
  if (uniqueVisual.size === 1 && visualAesthetics.length >= 2) score += 4;
  else if (uniqueVisual.size >= 3) score -= 4;

  const shoes = footwearPreference === 'none' ? undefined : byCategory(items, 'shoes');
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
  const color = scoreColor([...items], context.style, context.footwearPreference);
  const proportion = scoreProportion([...items], context.style);
  const skinTone = scoreSkinTone(
    [...items],
    context.skinTone,
    context.footwearPreference,
    context.colorPreference,
  );
  const occasion = scoreOccasion([...items], context.style, context.occasion);
  const fit = scoreFit([...items], context.measurements);
  const seasonScore = scoreSeason([...items], season);
  const cohesion = scoreCohesion([...items], context.style, context.footwearPreference);
  const wearability = scoreWearability([...items], context.style, context.occasion);

  style.score = clamp100(style.score * 0.7 + wearability.score * 0.3);
  cohesion.score = clamp100(cohesion.score * 0.55 + wearability.score * 0.45);

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
    ...wearability.issues,
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
    ...wearability.suggestions,
  ];

  // Strong outfits stay quiet — no filler copy.
  const strong = score >= 78;
  const dropFootwearGap = context.footwearPreference === 'none';
  const issues = (strong ? [] : unique(rawIssues)).filter(
    (issue) => !dropFootwearGap || !/missing shoes|no shoes|incomplete because.{0,40}shoe/i.test(issue),
  );
  const suggestions = (strong ? [] : unique(rawSuggestions)).filter(
    (suggestion) =>
      !dropFootwearGap || !/add (shoes|footwear|sneakers)|missing shoes/i.test(suggestion),
  );
  return {
    score,
    breakdown,
    issues,
    suggestions,
  };
}
