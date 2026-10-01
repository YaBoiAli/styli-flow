/**
 * Rebuild diversity: quality-first spreading and a soft reuse penalty.
 * Not part of fashion_score. First-generation (no previous outfit) is unchanged.
 */

export const SHORTLIST_QUALITY_BAND = 4;
export const REBUILD_FASHION_BAND = 3;
export const IDENTITY_REUSE_PENALTY = 2.5;
export const GROUP_REUSE_PENALTY = 1;

export const CANDIDATE_INTERPRETATION_GUIDE = `The five candidates must be meaningfully different valid interpretations of the requested style, not minor variations of one outfit.
Prefer distinct products when the catalog supports them.
Only use an interpretation when the inventory actually supports it. Do not force layering, color-forward looks, or elevated pieces that are not in the list. Do not invent products.
Suggested interpretations when inventory allows:
1. clean/minimal
2. more relaxed/baggy
3. layered
4. color-forward
5. more elevated
Skip any interpretation the catalog cannot support.
Stay recognizably in the requested style and occasion. Diversity means different valid interpretations, not a different style.`;

export const REBUILD_OUTFIT_INSTRUCTION = `Create a meaningfully different outfit from the previous outfit.
Prefer replacing at least two pieces when suitable alternatives exist.
Do not change pieces merely for novelty; replacements must improve or maintain style, occasion, proportion, color harmony, and wearability.`;

export type DiversityProduct = {
  id: string;
  name: string;
  brand?: string | null;
  category: string;
  subcategory?: string | null;
  color?: string | null;
  colors?: string[];
  fit?: string | null;
  silhouette?: string | null;
  visual_attributes?: {
    confidence?: number | null;
    primary_color?: string | null;
    color_family?: string | null;
    silhouette?: string | null;
    fit?: string | null;
  } | null;
};

export type PreviousOutfitItem = {
  product_id: string;
  name?: string | null;
  brand?: string | null;
  category?: string | null;
  color?: string | null;
};

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function productIdentityKey(product: {
  id?: string;
  name?: string | null;
  brand?: string | null;
  category?: string | null;
}): string {
  const name = norm(product.name);
  const brand = norm(product.brand);
  const category = norm(product.category);
  if (name && category) return `${brand}|${name}|${category}`;
  return `id:${product.id ?? ''}`;
}

function textOf(product: DiversityProduct): string {
  return [
    product.name,
    product.subcategory,
    product.fit,
    product.silhouette,
    product.visual_attributes?.silhouette,
    product.visual_attributes?.fit,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const BOTTOM_GROUPS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'joggers', pattern: /\bjoggers?\b|\bsweatpants\b|\btrack\s*pants\b/ },
  { key: 'cargos', pattern: /\bcargo/ },
  { key: 'baggy_jeans', pattern: /\bbaggy\b|\bwide\b|\bbig\s*boy\b/ },
  { key: 'chinos', pattern: /\bchino/ },
  { key: 'shorts', pattern: /\bshorts?\b/ },
  { key: 'trousers', pattern: /\btrouser|\bslack|\bdress\s*pant/ },
  { key: 'straight_jeans', pattern: /\bjean|\bdenim/ },
];

const TOP_GROUPS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'hoodie', pattern: /\bhoodie|\bzip[- ]up\b/ },
  { key: 'overshirt', pattern: /\bovershirt|\bshacket|\bflannel|\bshirt\s*jacket/ },
  { key: 'jacket', pattern: /\bjacket|\bbomber|\bcoach\b|\bwindbreaker|\bpuffer/ },
  { key: 'knit', pattern: /\bknit|\bsweater|\bcable\b/ },
  { key: 'crewneck', pattern: /\bcrewneck|\bsweatshirt/ },
  { key: 'graphic_tee', pattern: /\bgraphic\b|\bprint(?:ed)?\s+tee/ },
  { key: 'heavyweight_tee', pattern: /\bheavyweight|\bboxy\s+tee|\boversized\s+tee/ },
  { key: 'tee', pattern: /\btee\b|\bt-shirt|\btshirt/ },
];

const SHOE_GROUPS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'boots', pattern: /\bboots?\b|\bchelsea\b/ },
  { key: 'loafers', pattern: /\bloafer|\boxfords\b|\bderby/ },
  { key: 'sandals', pattern: /\bsandal|\bslide|\bmule/ },
  { key: 'sneakers', pattern: /\bsneaker|\btrainer|\bshoe/ },
];

function firstGroup(text: string, groups: Array<{ key: string; pattern: RegExp }>, fallback: string): string {
  for (const group of groups) {
    if (group.pattern.test(text)) return group.key;
  }
  return fallback;
}

export function productGroupKey(product: DiversityProduct): string {
  const text = textOf(product);
  if (product.category === 'bottom') return firstGroup(text, BOTTOM_GROUPS, 'bottom_other');
  if (product.category === 'top') return firstGroup(text, TOP_GROUPS, 'top_other');
  if (product.category === 'shoes') return firstGroup(text, SHOE_GROUPS, 'shoes_other');
  if (product.category === 'outerwear') return firstGroup(text, TOP_GROUPS, 'outerwear_other');
  return product.category || 'other';
}

export function colorKey(product: DiversityProduct): string {
  const visual = product.visual_attributes?.color_family ?? product.visual_attributes?.primary_color;
  const raw = visual || product.color || product.colors?.[0] || '';
  const value = norm(raw);
  if (!value) return 'unknown';
  if (/\bblack|charcoal|onyx\b/.test(value)) return 'black';
  if (/\bgray|grey|slate\b/.test(value)) return 'gray';
  if (/\bwhite|ivory|cream\b/.test(value)) return 'white';
  if (/\bnavy|blue\b/.test(value)) return 'blue';
  if (/\bgreen|olive|forest\b/.test(value)) return 'green';
  if (/\bbrown|tan|camel|khaki\b/.test(value)) return 'brown';
  if (/\bred|burgundy|wine\b/.test(value)) return 'red';
  return value.split(' ')[0] ?? 'unknown';
}

export function parsePreviousOutfit(value: unknown): PreviousOutfitItem[] {
  if (!Array.isArray(value)) return [];
  const items: PreviousOutfitItem[] = [];
  for (const row of value) {
    if (typeof row === 'string' && row.trim()) {
      items.push({ product_id: row.trim() });
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const id = (row as { product_id?: unknown; id?: unknown }).product_id
      ?? (row as { id?: unknown }).id;
    if (typeof id !== 'string' || !id.trim()) continue;
    const name = (row as { name?: unknown }).name;
    const brand = (row as { brand?: unknown }).brand;
    const category = (row as { category?: unknown }).category;
    const color = (row as { color?: unknown }).color;
    items.push({
      product_id: id.trim(),
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof brand === 'string' ? { brand } : {}),
      ...(typeof category === 'string' ? { category } : {}),
      ...(typeof color === 'string' ? { color } : {}),
    });
  }
  return items;
}

export function previousIdentitySet(previous: PreviousOutfitItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of previous) {
    keys.add(`id:${item.product_id}`);
    keys.add(productIdentityKey(item));
  }
  return keys;
}

export function previousGroupByCategory(previous: PreviousOutfitItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of previous) {
    if (!item.category) continue;
    map.set(item.category, productGroupKey({
      id: item.product_id,
      name: item.name ?? '',
      brand: item.brand,
      category: item.category,
    }));
  }
  return map;
}

export function reusePenalty(
  product: DiversityProduct,
  previous: PreviousOutfitItem[],
): number {
  if (!previous.length) return 0;
  const identities = previousIdentitySet(previous);
  if (identities.has(`id:${product.id}`) || identities.has(productIdentityKey(product))) {
    return IDENTITY_REUSE_PENALTY;
  }
  const groups = previousGroupByCategory(previous);
  const group = groups.get(product.category);
  if (group && group === productGroupKey(product)) return GROUP_REUSE_PENALTY;
  return 0;
}

/**
 * Round-robin across visual/style groups among products still near the best score.
 * Does not invent groups or pull in weak products.
 */
export function spreadAcrossGroups<T extends DiversityProduct>(
  ranked: T[],
  scoreOf: (product: T) => number,
  count: number,
  qualityBand = SHORTLIST_QUALITY_BAND,
  options?: { defer?: (product: T) => boolean },
): T[] {
  if (!ranked.length || count <= 0) return [];
  const best = scoreOf(ranked[0]);
  const eligible = ranked.filter((product) => scoreOf(product) >= best - qualityBand);
  const pool = eligible.length ? eligible : ranked.slice(0, count);
  const defer = options?.defer;
  const primary = defer ? pool.filter((product) => !defer(product)) : pool;
  const fallback = defer ? pool.filter((product) => defer(product)) : [];
  const chosen = pickSpread(primary.length ? primary : pool, scoreOf, count, ranked, best, qualityBand);
  if (chosen.length >= count || !fallback.length) return chosen;
  const seen = new Set(chosen.map((product) => product.id));
  for (const product of fallback) {
    if (chosen.length >= count) break;
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    chosen.push(product);
  }
  return chosen;
}

function pickSpread<T extends DiversityProduct>(
  pool: T[],
  scoreOf: (product: T) => number,
  count: number,
  ranked: T[],
  best: number,
  qualityBand: number,
): T[] {
  const queues = new Map<string, T[]>();
  for (const product of pool) {
    const key = productGroupKey(product);
    const list = queues.get(key) ?? [];
    list.push(product);
    queues.set(key, list);
  }
  const order = [...queues.keys()];
  const picked: T[] = [];
  const seen = new Set<string>();
  let index = 0;
  while (picked.length < count && order.some((key) => (queues.get(key) ?? []).length)) {
    const key = order[index % order.length];
    index += 1;
    const next = queues.get(key)?.shift();
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    picked.push(next);
  }
  for (const product of ranked) {
    if (picked.length >= count) break;
    if (seen.has(product.id)) continue;
    if (!pool.some((entry) => entry.id === product.id)) continue;
    if (scoreOf(product) < best - qualityBand) continue;
    seen.add(product.id);
    picked.push(product);
  }
  return picked;
}

export function countChangedPieces(
  current: DiversityProduct[],
  previous: PreviousOutfitItem[],
): number {
  if (!previous.length) return current.length;
  const prevByCategory = new Map<string, PreviousOutfitItem>();
  for (const item of previous) {
    if (item.category) prevByCategory.set(item.category, item);
  }
  const identities = previousIdentitySet(previous);
  let changed = 0;
  for (const product of current) {
    if (product.category === 'outerwear' || product.category === 'accessory') continue;
    const prev = prevByCategory.get(product.category);
    const sameId = identities.has(`id:${product.id}`);
    const sameIdentity = identities.has(productIdentityKey(product));
    const samePrev = prev
      ? productIdentityKey(product) === productIdentityKey(prev) || product.id === prev.product_id
      : sameId || sameIdentity;
    if (!samePrev) changed += 1;
  }
  return changed;
}

export function requiredPieceCount(
  products: DiversityProduct[],
  footwearPreference: 'include' | 'none' = 'include',
): number {
  const required = footwearPreference === 'none' ? ['top', 'bottom'] : ['top', 'bottom', 'shoes'];
  return products.filter((product) => required.includes(product.category)).length;
}

/**
 * Secondary rebuild signal only. 100 when there is no previous outfit.
 */
export function outfitDiversityScore(
  current: DiversityProduct[],
  previous: PreviousOutfitItem[],
  footwearPreference: 'include' | 'none' = 'include',
): number {
  if (!previous.length) return 100;
  const required = requiredPieceCount(current, footwearPreference) || (footwearPreference === 'none' ? 2 : 3);
  const changed = countChangedPieces(current, previous);
  let score = (changed / Math.max(1, required)) * 70;

  const prevGroups = previousGroupByCategory(previous);
  let groupChanges = 0;
  let colorChanges = 0;
  const prevColor = new Map<string, string>();
  for (const item of previous) {
    if (item.category && item.color) prevColor.set(item.category, colorKey({
      id: item.product_id,
      name: item.name ?? '',
      category: item.category,
      color: item.color,
    }));
  }
  for (const product of current) {
    if (product.category === 'outerwear' || product.category === 'accessory') continue;
    const prevGroup = prevGroups.get(product.category);
    if (prevGroup && prevGroup !== productGroupKey(product)) groupChanges += 1;
    const prevCol = prevColor.get(product.category);
    if (prevCol && prevCol !== colorKey(product)) colorChanges += 1;
  }
  score += Math.min(18, groupChanges * 9);
  score += Math.min(12, colorChanges * 6);

  const identities = previousIdentitySet(previous);
  const reused = current.filter(
    (product) =>
      identities.has(`id:${product.id}`) || identities.has(productIdentityKey(product)),
  ).length;
  score -= reused * 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function uniqueProductIds(outfits: Array<{ items: Array<{ product_id: string }> }>): Set<string> {
  const ids = new Set<string>();
  for (const outfit of outfits) {
    for (const item of outfit.items) ids.add(item.product_id);
  }
  return ids;
}

export function candidatesShareTooManyProducts(
  outfits: Array<{ items: Array<{ product_id: string }> }>,
): boolean {
  if (outfits.length < 2) return false;
  const unique = uniqueProductIds(outfits).size;
  const slots = outfits.reduce((sum, outfit) => sum + outfit.items.length, 0);
  return unique <= Math.ceil(slots / outfits.length) + 1;
}

export type ShortlistLogRow = {
  category: string;
  name: string;
  brand: string;
  price: number;
  relevance_score: number;
  style_score: number;
  occasion_score: number;
  visual_confidence: number | null;
  final_shortlist_score: number;
  group: string;
};

export function logOutfitShortlist(
  category: string,
  rows: ShortlistLogRow[],
): void {
  console.log(
    `[OUTFIT_SHORTLIST] ${JSON.stringify({
      category,
      count: rows.length,
      products: rows.slice(0, 15),
    })}`,
  );
}

export function matchPreviousInCatalog<T extends DiversityProduct>(
  catalog: T[],
  previous: PreviousOutfitItem[],
): T[] {
  if (!previous.length) return [];
  const identities = previousIdentitySet(previous);
  return catalog.filter(
    (product) => identities.has(`id:${product.id}`) || identities.has(productIdentityKey(product)),
  );
}
