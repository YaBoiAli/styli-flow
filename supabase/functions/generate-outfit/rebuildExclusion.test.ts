/**
 * Phase 4: rebuild exclusion + candidate diversity.
 * Run: npx tsx supabase/functions/generate-outfit/rebuildExclusion.test.ts
 */
import {
  evaluateOutfitCandidates,
  keepDiverseScoredCandidates,
  selectBestScoredCandidate,
  type AiOutfit,
  type ScoredOutfitCandidate,
} from './outfitCandidates.ts';
import {
  collectExcludeIds,
  containsExcludedProduct,
  candidatesShareTooManyProducts,
  parseExcludeProductIds,
  withoutExcludedProducts,
  type PreviousOutfitItem,
} from './outfitDiversity.ts';
import {
  emptyLiveRetrieval,
  mergeCatalogProducts,
  resolveGenerationCatalog,
} from './liveCatalog.ts';
import { shortlistForGemini, rankWorkingPool, type BudgetPlan } from './candidateShortlist.ts';
import type { CatalogProduct, CatalogResult } from './catalog.ts';
import type { OutfitScoreBreakdown } from '../_shared/catalog/outfitScoring.ts';
import { catalogProductFromNormalized } from './liveRetrieval.ts';
import { normalizeChannel3Product } from '../_shared/catalog/channel3/normalize.ts';
import type { Channel3Product } from '../_shared/catalog/channel3/types.ts';

let failed = 0;
let passed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${message}`);
}

function product(
  id: string,
  category: CatalogProduct['category'],
  extra: Partial<CatalogProduct> = {},
): CatalogProduct {
  return {
    id,
    name: extra.name ?? `${category} ${id}`,
    brand: extra.brand ?? 'Acme',
    brand_id: extra.brand_id ?? 'brand-1',
    category,
    subcategory:
      extra.subcategory ??
      (category === 'shoes' ? 'sneakers' : category === 'bottom' ? 'jeans' : 't-shirt'),
    price: extra.price ?? 40,
    currency: 'USD',
    color: extra.color ?? 'black',
    colors: extra.colors ?? ['black'],
    material: extra.material ?? 'cotton',
    description: extra.description ?? null,
    gender: extra.gender ?? 'men',
    image_url: extra.image_url ?? 'https://cdn.example.com/a.jpg',
    purchase_url: extra.purchase_url ?? 'https://shop.example.com/p/1',
    style_tags: extra.style_tags ?? ['streetwear'],
    occasion_tags: extra.occasion_tags ?? ['everyday'],
    aesthetic_tags: extra.aesthetic_tags ?? [],
    season_tags: extra.season_tags ?? [],
    fit: extra.fit ?? null,
    silhouette: extra.silhouette ?? null,
    pattern: extra.pattern ?? null,
    formality: extra.formality ?? null,
    source: extra.source ?? 'shopify',
    source_product_id: extra.source_product_id ?? id,
  };
}

const budget: BudgetPlan = { outfit: 150, shoes: null };
const previous: PreviousOutfitItem[] = [
  { product_id: 'channel3:top-prev', name: 'Prev Tee', category: 'top' },
  { product_id: 'channel3:bottom-prev', name: 'Prev Jeans', category: 'bottom' },
  { product_id: 'channel3:shoe-prev', name: 'Prev Sneakers', category: 'shoes' },
];

function shortlist(
  products: CatalogProduct[],
  excludeIds: Set<string>,
  previousOutfit: PreviousOutfitItem[] = [],
  footwear: 'include' | 'none' = 'include',
) {
  return shortlistForGemini({
    products,
    style: 'Streetwear',
    occasion: 'Everyday',
    budget,
    excludeIds,
    skinTone: null,
    footwearPreference: footwear,
    colorPreference: 'style_first',
    previousOutfit,
  });
}

function storedOk(products: CatalogProduct[]): CatalogResult {
  return { ok: true, products, catalogSource: 'live', unavailableBrands: [] };
}

function liveOf(products: CatalogProduct[]) {
  return {
    ...emptyLiveRetrieval('empty_results'),
    attempted: true,
    ok: true,
    reason: 'successful' as const,
    products,
    fetched: products.length,
    usable: products.length,
  };
}

function breakdown(partial: Partial<OutfitScoreBreakdown> = {}): OutfitScoreBreakdown {
  return {
    style: 70,
    color: 70,
    proportion: 70,
    skinTone: 70,
    occasion: 70,
    fit: 70,
    season: 70,
    cohesion: 70,
    ...partial,
  };
}

function scored(
  index: number,
  score: number,
  ids: string[],
): Extract<ScoredOutfitCandidate<string[]>, { valid: true }> {
  const sheet = breakdown();
  return {
    valid: true,
    index,
    score,
    breakdown: sheet,
    issues: [],
    suggestions: [],
    fashion: { score, breakdown: sheet, issues: [], suggestions: [] },
    outfit: {
      outfit_name: `Look ${index}`,
      styling_tip: 'Tip',
      items: ids.map((product_id) => ({ product_id, reason: '' })),
    },
    built: ids,
  };
}

function outfit(ids: string[]): AiOutfit {
  return {
    outfit_name: 'Look',
    styling_tip: 'Tip',
    items: ids.map((product_id) => ({ product_id, reason: '' })),
  };
}

const catalog = new Map([
  product('t1', 'top'),
  product('t2', 'top'),
  product('t3', 'top'),
  product('b1', 'bottom'),
  product('b2', 'bottom'),
  product('b3', 'bottom'),
  product('s1', 'shoes'),
  product('s2', 'shoes'),
  product('s3', 'shoes'),
  product('channel3:top-prev', 'top'),
  product('channel3:bottom-prev', 'bottom'),
  product('channel3:shoe-prev', 'shoes'),
  product('fresh-top', 'top'),
  product('fresh-bottom', 'bottom'),
  product('fresh-shoe', 'shoes'),
].map((row) => [row.id, row]));

function validate(candidate: AiOutfit) {
  const products = candidate.items.map((item) => {
    const row = catalog.get(item.product_id);
    if (!row) throw new Error('invalid_ai');
    return row;
  });
  return products;
}

function fashion(score: number) {
  return { score, breakdown: breakdown(), issues: [], suggestions: [] };
}

// --- Exclusion parsing / first generation ---
assert(parseExcludeProductIds([]).size === 0, 'first generation: empty exclude_product_ids');
assert(parseExcludeProductIds(undefined).size === 0, 'first generation: missing exclude_product_ids');
assert(collectExcludeIds([], []).size === 0, 'first generation: no previous outfit → no exclusions');

const rebuildIds = collectExcludeIds(
  previous.map((item) => item.product_id),
  previous,
);
assert(rebuildIds.has('channel3:top-prev'), 'rebuild exclude set includes previous top');
assert(rebuildIds.has('channel3:bottom-prev'), 'rebuild exclude set includes previous bottom');
assert(rebuildIds.has('channel3:shoe-prev'), 'rebuild exclude set includes previous shoes');
assert(rebuildIds.size === 3, 'rebuild exclude set is exactly previous product IDs');

const noShoesPrevious: PreviousOutfitItem[] = previous.filter((item) => item.category !== 'shoes');
const noShoesIds = collectExcludeIds(
  noShoesPrevious.map((item) => item.product_id),
  noShoesPrevious,
);
assert(noShoesIds.has('channel3:top-prev'), 'no-shoes rebuild excludes top');
assert(noShoesIds.has('channel3:bottom-prev'), 'no-shoes rebuild excludes bottom');
assert(!noShoesIds.has('channel3:shoe-prev'), 'no-shoes rebuild does not add a fake shoe ID');
assert(noShoesIds.size === 2, 'no-shoes rebuild excludes only existing products');

assert(
  parseExcludeProductIds(['channel3:abc', { product_id: 'stored-uuid' }, { id: 'also' }]).size === 3,
  'exclude_product_ids accepts strings, product_id, and id',
);

const mixedPool = [
  product('channel3:top-prev', 'top'),
  product('fresh-top', 'top'),
  product('channel3:bottom-prev', 'bottom'),
  product('fresh-bottom', 'bottom'),
  product('channel3:shoe-prev', 'shoes'),
  product('fresh-shoe', 'shoes'),
];
const filtered = withoutExcludedProducts(mixedPool, rebuildIds);
assert(!filtered.some((row) => rebuildIds.has(row.id)), 'excluded IDs are dropped from product pools');
assert(filtered.some((row) => row.id === 'fresh-top'), 'non-excluded products remain');

assert(
  containsExcludedProduct(outfit(['fresh-top', 'channel3:bottom-prev', 'fresh-shoe']).items, rebuildIds),
  'any excluded ID in a candidate is rejected, not only an identical set',
);
assert(
  !containsExcludedProduct(outfit(['fresh-top', 'fresh-bottom', 'fresh-shoe']).items, rebuildIds),
  'candidates with no excluded IDs stay eligible',
);

// --- Shortlist / Gemini pool ---
const shortlisted = shortlist(mixedPool, rebuildIds, previous);
assert(
  !shortlisted.some((row) => rebuildIds.has(row.id)),
  'excluded products do not survive Gemini shortlist',
);
assert(shortlisted.some((row) => row.id === 'fresh-top'), 'shortlist still includes replacements');

const ranked = rankWorkingPool({
  products: mixedPool,
  style: 'Streetwear',
  occasion: 'Everyday',
  budget,
  excludeIds: rebuildIds,
  skinTone: null,
  footwearPreference: 'include',
  colorPreference: 'style_first',
  previousOutfit: previous,
});
assert(!ranked.some((row) => rebuildIds.has(row.id)), 'excluded products do not survive visual rank pool');

const revisionPool = shortlisted;
assert(
  !revisionPool.some((row) => rebuildIds.has(row.id)),
  'revision catalog sourced from the shortlist cannot reintroduce excluded IDs',
);

const sneaky = evaluateOutfitCandidates({
  outfits: [
    outfit(['channel3:top-prev', 'fresh-bottom', 'fresh-shoe']),
    outfit(['fresh-top', 'fresh-bottom', 'fresh-shoe']),
  ],
  excludeIds: rebuildIds,
  validate,
  productsOf: (products) => products,
  score: (products) => fashion(products.some((row) => rebuildIds.has(row.id)) ? 99 : 80),
  previousOutfit: previous,
  footwearPreference: 'include',
});
assert(
  sneaky.candidates[0]?.valid === false,
  'Gemini cannot sneak an excluded product back in via candidate construction',
);
assert(sneaky.winner?.built.every((row) => !rebuildIds.has(row.id)), 'winner never includes excluded IDs');

// --- Live / stored / hybrid ---
const liveExcluded = product('channel3:top-prev', 'top', { source: 'channel3' });
const liveFresh = product('channel3:top-fresh', 'top', { source: 'channel3' });
const liveBottom = product('channel3:bottom-fresh', 'bottom', { source: 'channel3' });
const liveShoe = product('channel3:shoe-fresh', 'shoes', { source: 'channel3' });
const storedExcluded = product('stored-prev', 'top');
const storedFresh = product('stored-top-2', 'top');
const storedBottom = product('stored-bottom', 'bottom');
const storedShoe = product('stored-shoe', 'shoes');

const afterLive = withoutExcludedProducts(
  [liveExcluded, liveFresh, liveBottom, liveShoe],
  new Set(['channel3:top-prev']),
);
assert(!afterLive.some((row) => row.id === 'channel3:top-prev'), 'live Channel3 candidates drop excluded IDs after normalize');
assert(afterLive.some((row) => row.id === 'channel3:top-fresh'), 'other live candidates remain');

const afterStored = withoutExcludedProducts(
  [storedExcluded, storedFresh, storedBottom, storedShoe],
  new Set(['stored-prev']),
);
assert(!afterStored.some((row) => row.id === 'stored-prev'), 'stored catalog drops excluded IDs');
assert(afterStored.some((row) => row.id === 'stored-top-2'), 'other stored products remain');

const hybridMerged = mergeCatalogProducts(
  [liveExcluded, liveBottom, liveShoe],
  [storedExcluded, storedFresh, storedBottom, storedShoe],
);
const hybridFiltered = withoutExcludedProducts(
  hybridMerged,
  new Set(['channel3:top-prev', 'stored-prev']),
);
assert(!hybridFiltered.some((row) => row.id === 'channel3:top-prev'), 'hybrid: excluded live ID stays excluded after merge');
assert(!hybridFiltered.some((row) => row.id === 'stored-prev'), 'hybrid: excluded stored ID stays excluded after merge');
assert(hybridFiltered.some((row) => row.id === 'stored-top-2'), 'hybrid: replacement stored product remains');

const now = '2026-09-25T12:00:00.000Z';
const rawLive: Channel3Product = {
  id: 'top-prev',
  title: 'Prev Tee',
  images: [{ url: 'https://cdn.example.com/a.jpg', is_main_image: true }],
  offers: [{
    url: 'https://shop.example.com/p/1',
    domain: 'shop.example.com',
    price: { price: 42, currency: 'USD' },
    availability: 'InStock',
  }],
  category: { slug: 't-shirts', title: 't-shirts', path: [], has_children: false },
  brands: [{ id: 'b1', name: 'Acme' }],
  gender: 'male',
};
const normalized = normalizeChannel3Product(rawLive, { now, fallbackBrand: 'Acme' });
assert(normalized.ok, 'Channel3 normalize succeeds for exclusion fixture');
if (normalized.ok) {
  const mapped = catalogProductFromNormalized(normalized.product);
  assert(mapped.id === 'channel3:top-prev', 'canonical live ID is source_product_id');
  assert(
    collectExcludeIds(['channel3:top-prev'], []).has(mapped.id),
    'client-sent Channel3 ID matches pipeline exclusion ID',
  );
}

// --- Diversity helper semantics ---
const identical = [outfit(['t1', 'b1', 's1']), outfit(['t1', 'b1', 's1'])];
const shareTwo = [outfit(['t1', 'b1', 's1']), outfit(['t1', 'b1', 's2'])];
const shareOne = [outfit(['t1', 'b1', 's1']), outfit(['t1', 'b2', 's2'])];
assert(candidatesShareTooManyProducts(identical), 'identical product IDs count as clones');
assert(candidatesShareTooManyProducts(shareTwo), 'sharing two of three products is a near-clone (unique <= 4)');
assert(!candidatesShareTooManyProducts(shareOne), 'sharing one of three products remains eligible (unique = 5)');

const identicalKept = keepDiverseScoredCandidates([
  scored(0, 90, ['t1', 'b1', 's1']),
  scored(1, 89, ['t1', 'b1', 's1']),
]);
assert(identicalKept.length === 1, 'identical candidates: only one survives');
assert(identicalKept[0]?.index === 0, 'identical candidates: highest-scoring copy is kept');

const nearCloneKept = keepDiverseScoredCandidates([
  scored(0, 90, ['t1', 'b1', 's1']),
  scored(1, 88, ['t1', 'b1', 's2']),
]);
assert(nearCloneKept.length === 1, 'near-clone candidate is skipped');
assert(nearCloneKept[0]?.index === 0, 'near-clone skip keeps the first ranked candidate');

const shareOneKept = keepDiverseScoredCandidates([
  scored(0, 90, ['t1', 'b1', 's1']),
  scored(1, 88, ['t1', 'b2', 's2']),
]);
assert(shareOneKept.length === 2, 'sharing one product: both remain eligible');

const threeKept = keepDiverseScoredCandidates([
  scored(0, 90, ['t1', 'b1', 's1']),
  scored(1, 89, ['t1', 'b1', 's2']),
  scored(2, 87, ['t3', 'b3', 's3']),
]);
assert(threeKept.some((row) => row.index === 0), 'three-candidate: A remains');
assert(!threeKept.some((row) => row.index === 1), 'three-candidate: B near-clone of A is skipped');
assert(threeKept.some((row) => row.index === 2), 'three-candidate: C remains available instead of being crowded out');

const threeFromUnfiltered = selectBestScoredCandidate([
  scored(0, 90, ['t1', 'b1', 's1']),
  scored(1, 89, ['t1', 'b1', 's2']),
  scored(2, 87, ['t3', 'b3', 's3']),
]);
assert(threeFromUnfiltered?.index === 0, 'three-candidate: highest remaining fashion score still wins');

const sparse = selectBestScoredCandidate([
  scored(0, 81, ['t1', 'b1', 's1']),
]);
assert(sparse?.index === 0, 'sparse catalog: the only valid candidate still wins');
assert(sparse !== null, 'sparse catalog: generation still succeeds');

const allShareSome = selectBestScoredCandidate([
  scored(0, 90, ['t1', 'b1', 's1']),
  scored(1, 88, ['t1', 'b2', 's2']),
]);
assert(allShareSome !== null, 'candidates that share one product are not all rejected');
assert(allShareSome?.index === 0, 'when all share some products under the threshold, highest score wins');

const onlyClones = keepDiverseScoredCandidates([
  scored(0, 90, ['t1', 'b1', 's1']),
  scored(1, 89, ['t1', 'b1', 's1']),
]);
assert(onlyClones.length === 1, 'if every alternative is a clone, keep the highest-scoring valid candidate');

const differentIdsSameSlots = [outfit(['t1', 'b1', 's1']), outfit(['t9', 'b9', 's9'])];
assert(
  !candidatesShareTooManyProducts(differentIdsSameSlots),
  'different product IDs with the same outfit structure are not clones (no visual similarity in this phase)',
);

async function main() {
  const hybridResolved = await resolveGenerationCatalog({
    retrieveLive: async () => liveOf([liveExcluded, liveBottom, liveShoe]),
    loadStored: async () => storedOk([storedFresh, storedBottom, storedShoe]),
    isSufficient: (products) =>
      products.some((row) => row.category === 'top') &&
      products.some((row) => row.category === 'bottom') &&
      products.some((row) => row.category === 'shoes'),
    excludeIds: new Set(['channel3:top-prev']),
  });
  assert(!hybridResolved.products.some((row) => row.id === 'channel3:top-prev'), 'resolveGenerationCatalog drops excluded live IDs');
  assert(
    hybridResolved.products.some((row) => row.id === 'stored-top-2' || row.category === 'top'),
    'resolveGenerationCatalog can fill from stored after excluding live',
  );

  const storedResolved = await resolveGenerationCatalog({
    retrieveLive: async () => emptyLiveRetrieval('no_api_key'),
    loadStored: async () => storedOk([storedExcluded, storedFresh, storedBottom, storedShoe]),
    isSufficient: () => false,
    excludeIds: new Set(['stored-prev']),
  });
  assert(!storedResolved.products.some((row) => row.id === 'stored-prev'), 'stored-only catalog drops excluded IDs');

  const liveResolved = await resolveGenerationCatalog({
    retrieveLive: async () => liveOf([liveExcluded, liveFresh, liveBottom, liveShoe]),
    loadStored: async () => storedOk([]),
    isSufficient: (products) =>
      products.some((row) => row.category === 'top' && row.id !== 'channel3:top-prev') &&
      products.some((row) => row.category === 'bottom') &&
      products.some((row) => row.category === 'shoes'),
    excludeIds: new Set(['channel3:top-prev']),
  });
  assert(!liveResolved.products.some((row) => row.id === 'channel3:top-prev'), 'live-sufficient path still drops excluded IDs');
  assert(liveResolved.products.some((row) => row.id === 'channel3:top-fresh'), 'live-sufficient path keeps replacements');

  console.log(`rebuildExclusion tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    throw new Error(`${failed} rebuildExclusion test(s) failed`);
  }
}

void main();

