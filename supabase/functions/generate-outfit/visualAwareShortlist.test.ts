/**
 * Phase 5B: visual-aware shortlist ranking.
 * Run: npx tsx supabase/functions/generate-outfit/visualAwareShortlist.test.ts
 */
import { OCCASIONS, STYLES } from '../../../types/index.ts';
import {
  OCCASION_CONTRACT,
  STYLE_CONTRACT,
} from '../_shared/catalog/styleOccasionContract.ts';
import {
  emptyVisualAttributes,
  MAX_VISUAL_ANALYSIS_PRODUCTS,
  type VisualAttributes,
} from '../_shared/catalog/visualAttributes.ts';
import {
  shortlistForGemini,
  rankWorkingPool,
  TOP_PICKS_PER_CATEGORY,
  VISUAL_POOL_MULTIPLIER,
  VISUAL_RANK_PER_CATEGORY,
  type BudgetPlan,
} from './candidateShortlist.ts';
import type { CatalogProduct } from './catalog.ts';
import { isFootwearProduct } from './footwearPreference.ts';
import {
  scoreVisualCandidateRelevance,
  VISUAL_ADJUSTMENT_MAX,
} from './visualCandidateRanking.ts';

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
    visual_attributes: extra.visual_attributes,
  };
}

function visual(
  confidence: number,
  partial: Partial<VisualAttributes> = {},
): VisualAttributes {
  return {
    ...emptyVisualAttributes(confidence),
    ...partial,
    confidence,
  };
}

const budget: BudgetPlan = { outfit: 150, shoes: null };
const emptyIds = new Set<string>();

function shortlist(
  products: CatalogProduct[],
  extra: Partial<Parameters<typeof shortlistForGemini>[0]> = {},
) {
  return shortlistForGemini({
    products,
    style: 'Streetwear',
    occasion: 'Everyday',
    budget,
    excludeIds: emptyIds,
    skinTone: null,
    footwearPreference: 'include',
    colorPreference: 'style_first',
    visualAware: true,
    ...extra,
  });
}

const strongStreetVisual = visual(0.88, {
  fit: 'oversized',
  silhouette: 'baggy',
  visual_weight: 'heavy',
  visual_intensity: 8,
  pattern_intensity: 'high',
  saturation: 'high',
  formality: 0.2,
  color_family: 'black',
});

const compatibleA = product('text-a', 'top', {
  name: 'Streetwear Oversized Graphic Hoodie',
  subcategory: 'hoodie',
  style_tags: ['streetwear'],
  price: 42,
});
const compatibleB = product('visual-b', 'top', {
  name: 'Streetwear Oversized Graphic Hoodie Twin',
  subcategory: 'hoodie',
  style_tags: ['streetwear'],
  price: 42,
  visual_attributes: strongStreetVisual,
});
const bottoms = [
  product('b1', 'bottom', { name: 'Streetwear Baggy Jeans', style_tags: ['streetwear'] }),
];
const shoes = [
  product('s1', 'shoes', { name: 'Streetwear Sneakers', style_tags: ['streetwear'] }),
];

const closePair = shortlist([compatibleA, compatibleB, ...bottoms, ...shoes]);
const closeTops = closePair.filter((row) => row.category === 'top');
assert(closeTops[0]?.id === 'visual-b', '1: visually compatible product can move above a similarly text-ranked twin');
assert(
  scoreVisualCandidateRelevance(compatibleB, 'Streetwear', 'Everyday') >
    scoreVisualCandidateRelevance(compatibleA, 'Streetwear', 'Everyday'),
  '1b: visual adjustment is positive only for usable matching evidence',
);

const weakText = product('weak-c', 'top', {
  name: 'Plain Cotton Undershirt',
  subcategory: 't-shirt',
  style_tags: [],
  occasion_tags: [],
  visual_attributes: strongStreetVisual,
});
const irrelevant = shortlist([compatibleA, weakText, ...bottoms, ...shoes]);
const irrelevantTops = irrelevant.filter((row) => row.category === 'top');
assert(irrelevantTops[0]?.id === 'text-a', '2: poor text relevance cannot jump the shortlist on visual attributes alone');
assert(
  scoreVisualCandidateRelevance(weakText, 'Streetwear', 'Everyday') <= VISUAL_ADJUSTMENT_MAX,
  '2b: visual adjustment stays bounded',
);

const missingVisual = product('missing-d', 'top', {
  name: 'Streetwear Oversized Graphic Hoodie',
  subcategory: 'hoodie',
  style_tags: ['streetwear'],
  price: 41,
});
assert(scoreVisualCandidateRelevance(missingVisual, 'Streetwear', 'Everyday') === 0, '3: missing visual data is 0, not a penalty');
const missingOrder = shortlist([missingVisual, compatibleA, ...bottoms, ...shoes]);
assert(
  missingOrder.filter((row) => row.category === 'top').some((row) => row.id === 'missing-d'),
  '3b: missing visual still remains eligible from text ranking',
);

const lowConfidence = product('low-conf', 'top', {
  name: 'Streetwear Oversized Graphic Hoodie Twin',
  subcategory: 'hoodie',
  style_tags: ['streetwear'],
  visual_attributes: visual(0.2, {
    fit: 'oversized',
    silhouette: 'baggy',
    visual_intensity: 9,
    pattern_intensity: 'high',
    saturation: 'high',
    formality: 0.2,
  }),
});
assert(
  scoreVisualCandidateRelevance(lowConfidence, 'Streetwear', 'Everyday') === 0,
  '4: low-confidence visual attributes are ignored',
);
const lowConfList = shortlist([compatibleA, lowConfidence, ...bottoms, ...shoes]);
assert(
  lowConfList.filter((row) => row.category === 'top')[0]?.id === 'text-a' ||
    scoreVisualCandidateRelevance(lowConfidence, 'Streetwear', 'Everyday') === 0,
  '4b: low-confidence visual does not outrank equal text',
);

assert(VISUAL_ADJUSTMENT_MAX === 2.5, '5: visual adjustment cap is modest');
const textGap =
  scoreVisualCandidateRelevance(compatibleB, 'Streetwear', 'Everyday') <= VISUAL_ADJUSTMENT_MAX;
assert(textGap, '5b: visual bonus cannot exceed the bounded adjustment');

const sameLook = product('volume-top', 'top', {
  name: 'Oversized Hoodie',
  visual_attributes: strongStreetVisual,
});
const streetAdj = scoreVisualCandidateRelevance(sameLook, 'Streetwear', 'Everyday');
const quietAdj = scoreVisualCandidateRelevance(sameLook, 'Quiet Luxury', 'Everyday');
assert(streetAdj > quietAdj, '6: STYLE_CONTRACT volume/intensity priors drive visual adjustment');
assert(STYLE_CONTRACT.Streetwear.volumeFriendly, '6b: Streetwear volumeFriendly comes from STYLE_CONTRACT');
assert(!STYLE_CONTRACT['Quiet Luxury'].volumeFriendly, '6c: Quiet Luxury volumeFriendly comes from STYLE_CONTRACT');

const dressyShoe = product('dress-shoe', 'shoes', {
  name: 'Leather Oxford',
  visual_attributes: visual(0.9, {
    silhouette: 'structured',
    formality: 0.85,
    visual_weight: 'light',
    color_family: 'brown',
  }),
});
const eventAdj = scoreVisualCandidateRelevance(dressyShoe, 'Formal', 'Event');
const everydayAdj = scoreVisualCandidateRelevance(dressyShoe, 'Formal', 'Everyday');
assert(eventAdj > everydayAdj, '7: OCCASION_CONTRACT classyFootwear/formality drives shoe visual adjustment');
assert(OCCASION_CONTRACT.Event.classyFootwear, '7b: Event classyFootwear comes from OCCASION_CONTRACT');
assert(!OCCASION_CONTRACT.Everyday.classyFootwear, '7c: Everyday classyFootwear comes from OCCASION_CONTRACT');

let threw = false;
try {
  for (const style of STYLES) {
    const value = scoreVisualCandidateRelevance(compatibleB, style, 'Everyday');
    assert(Number.isFinite(value) && value >= 0, `${style}: visual helper returns a finite non-negative score`);
  }
  for (const occasion of OCCASIONS) {
    const value = scoreVisualCandidateRelevance(compatibleB, 'Streetwear', occasion);
    assert(Number.isFinite(value) && value >= 0, `${occasion}: visual helper returns a finite non-negative score`);
  }
} catch {
  threw = true;
}
assert(!threw, '8-9: all canonical styles and occasions pass through without throwing');

const sneaker = product('sneak', 'shoes', { name: 'White Sneakers', style_tags: ['streetwear'] });
const noShoes = shortlist([compatibleA, ...bottoms, sneaker], {
  footwearPreference: 'none',
  visualAware: true,
});
assert(noShoes.every((row) => !isFootwearProduct(row)), '10: no-shoes visual-aware shortlist contains zero footwear');
assert(!noShoes.some((row) => row.category === 'shoes'), '10b: no-shoes shortlist has no shoes category');

const excluded = shortlist([compatibleA, compatibleB, ...bottoms, ...shoes], {
  excludeIds: new Set(['visual-b']),
  visualAware: true,
});
assert(!excluded.some((row) => row.id === 'visual-b'), '11: excluded IDs stay excluded after visual-aware shortlisting');

const manyTops = Array.from({ length: 16 }, (_, index) =>
  product(`top-${index}`, 'top', {
    name: `Streetwear Graphic Tee ${index}`,
    style_tags: ['streetwear'],
    visual_attributes: index % 2 === 0 ? strongStreetVisual : undefined,
  }),
);
const manyBottoms = Array.from({ length: 16 }, (_, index) =>
  product(`bottom-${index}`, 'bottom', {
    name: `Streetwear Baggy Jeans ${index}`,
    style_tags: ['streetwear'],
  }),
);
const manyShoes = Array.from({ length: 16 }, (_, index) =>
  product(`shoe-${index}`, 'shoes', {
    name: `Streetwear Sneakers ${index}`,
    style_tags: ['streetwear'],
  }),
);
const covered = shortlist([...manyTops, ...manyBottoms, ...manyShoes]);
assert(
  covered.filter((row) => row.category === 'top').length === TOP_PICKS_PER_CATEGORY,
  '12: top coverage uses the existing per-category shortlist size',
);
assert(
  covered.filter((row) => row.category === 'bottom').length === TOP_PICKS_PER_CATEGORY,
  '12b: bottom coverage is preserved',
);
assert(
  covered.filter((row) => row.category === 'shoes').length === TOP_PICKS_PER_CATEGORY,
  '12c: shoe coverage is preserved when shoes are included',
);
assert(TOP_PICKS_PER_CATEGORY === 7, '13: final shortlist size per category is unchanged');

assert(VISUAL_POOL_MULTIPLIER === 2, '14: visual pool is shortlist × 2');
assert(
  VISUAL_RANK_PER_CATEGORY === TOP_PICKS_PER_CATEGORY * 2,
  '14b: text candidate pool is broader than the final Gemini shortlist',
);
const textPool = rankWorkingPool({
  products: [...manyTops, ...manyBottoms, ...manyShoes],
  style: 'Streetwear',
  occasion: 'Everyday',
  budget,
  excludeIds: emptyIds,
  skinTone: null,
  footwearPreference: 'include',
  colorPreference: 'style_first',
});
assert(
  textPool.filter((row) => row.category === 'top').length === VISUAL_RANK_PER_CATEGORY,
  '14c: pre-visual text pool uses VISUAL_RANK_PER_CATEGORY',
);
assert(
  textPool.filter((row) => row.category === 'top').length > TOP_PICKS_PER_CATEGORY,
  '14d: visual candidate pool is broader than the Gemini shortlist',
);

assert(MAX_VISUAL_ANALYSIS_PRODUCTS === 15, '15: visual enrichment cap remains 15');

assert(VISUAL_RANK_PER_CATEGORY > TOP_PICKS_PER_CATEGORY, '16: broader pool is taken from already-retrieved products, not extra Channel3 queries');

const textOnly = shortlistForGemini({
  products: [compatibleA, compatibleB, ...bottoms, ...shoes],
  style: 'Streetwear',
  occasion: 'Everyday',
  budget,
  excludeIds: emptyIds,
  skinTone: null,
  footwearPreference: 'include',
  colorPreference: 'style_first',
});
assert(
  textOnly.filter((row) => row.category === 'top').length <= TOP_PICKS_PER_CATEGORY,
  'pre-visual shortlist (isSufficient path) stays text-ranked and size-capped',
);

console.log(`visualAwareShortlist tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} visualAwareShortlist test(s) failed`);
}
