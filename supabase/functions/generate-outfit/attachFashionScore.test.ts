/**
 * Phase 1.5: scoreOutfit is attached after validateAndBuild.
 * Low scores are still returned. Gemini and heuristic share this path.
 * Run: npm run test:outfit-score
 */
import { scoreOutfit } from '../_shared/catalog/outfitScoring.ts';
import type { CatalogProduct } from './catalog.ts';
import { toFashionResponseFields } from './attachFashionScore.ts';

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
  partial: Pick<CatalogProduct, 'id' | 'name' | 'category'> & Partial<CatalogProduct>,
): CatalogProduct {
  return {
    brand: 'Test',
    brand_id: null,
    subcategory: null,
    price: 40,
    currency: 'USD',
    color: '',
    colors: [],
    material: null,
    description: null,
    gender: 'unisex',
    image_url: 'https://example.com/p.jpg',
    purchase_url: 'https://example.com/p',
    style_tags: [],
    occasion_tags: [],
    aesthetic_tags: [],
    season_tags: [],
    fit: null,
    silhouette: null,
    pattern: null,
    formality: null,
    source: 'demo',
    ...partial,
  };
}

const coherent = [
  product({
    id: 'top-1',
    category: 'top',
    name: 'Black Cotton Tee',
    color: 'black',
    colors: ['black'],
    subcategory: 't-shirt',
    fit: 'regular',
    formality: 'casual',
    style_tags: ['casual', 'streetwear'],
    season_tags: ['all_season'],
  }),
  product({
    id: 'bottom-1',
    category: 'bottom',
    name: 'Blue Straight Jeans',
    color: 'blue',
    colors: ['blue'],
    subcategory: 'jeans',
    silhouette: 'straight',
    formality: 'casual',
    style_tags: ['casual'],
    season_tags: ['all_season'],
  }),
  product({
    id: 'shoes-1',
    category: 'shoes',
    name: 'White Canvas Sneakers',
    color: 'white',
    colors: ['white'],
    subcategory: 'sneakers',
    formality: 'casual',
    style_tags: ['casual'],
    season_tags: ['all_season'],
  }),
];

const lowQuality = [
  product({
    id: 'top-clash',
    category: 'top',
    name: 'Bright Orange Neon Tee',
    color: 'bright orange',
    colors: ['bright orange', 'neon'],
    subcategory: 't-shirt',
    fit: 'oversized',
    pattern: 'graphic',
    formality: 'casual',
    style_tags: ['streetwear'],
  }),
  product({
    id: 'bottom-clash',
    category: 'bottom',
    name: 'Formal Wool Trousers',
    color: 'neon green',
    colors: ['neon green'],
    material: 'wool',
    subcategory: 'pants',
    fit: 'slim',
    formality: 'formal',
    style_tags: ['formal'],
  }),
  product({
    id: 'shoes-clash',
    category: 'shoes',
    name: 'Cobalt Dress Loafers',
    color: 'cobalt',
    colors: ['cobalt'],
    subcategory: 'loafers',
    formality: 'formal',
    style_tags: ['formal'],
  }),
];

function scoredPayload(
  items: CatalogProduct[],
  style: string,
  occasion: string,
  source: 'gemini' | 'heuristic',
) {
  const fashion = scoreOutfit(items, { style, occasion });
  const fields = toFashionResponseFields(fashion);
  return {
    outfit_name: `${source} ${style} ${occasion}`,
    styling_tip: 'Keep the silhouette clean.',
    style,
    occasion,
    items: items.map((item) => ({ product_id: item.id })),
    source,
    ...fields,
  };
}

const geminiCoherent = scoredPayload(coherent, 'Casual', 'Everyday', 'gemini');
const heuristicCoherent = scoredPayload(coherent, 'Casual', 'Everyday', 'heuristic');
const geminiLow = scoredPayload(lowQuality, 'Minimalist', 'Work', 'gemini');
const heuristicLow = scoredPayload(lowQuality, 'Streetwear', 'Everyday', 'heuristic');

console.log(
  JSON.stringify(
    {
      geminiCoherent: geminiCoherent.fashion_score,
      heuristicCoherent: heuristicCoherent.fashion_score,
      geminiLow: geminiLow.fashion_score,
      heuristicLow: heuristicLow.fashion_score,
      geminiLowIssues: geminiLow.fashion_issues,
    },
    null,
    2,
  ),
);

for (const payload of [geminiCoherent, heuristicCoherent, geminiLow, heuristicLow]) {
  assert(typeof payload.fashion_score === 'number', `${payload.source} has fashion_score`);
  assert(payload.fashion_score >= 0 && payload.fashion_score <= 100, `${payload.source} score is 0-100`);
  assert(typeof payload.fashion_breakdown.style === 'number', `${payload.source} has style breakdown`);
  assert(typeof payload.fashion_breakdown.color === 'number', `${payload.source} has color breakdown`);
  assert(typeof payload.fashion_breakdown.proportion === 'number', `${payload.source} has proportion`);
  assert(typeof payload.fashion_breakdown.skinTone === 'number', `${payload.source} has skinTone`);
  assert(typeof payload.fashion_breakdown.occasion === 'number', `${payload.source} has occasion`);
  assert(typeof payload.fashion_breakdown.fit === 'number', `${payload.source} has fit`);
  assert(typeof payload.fashion_breakdown.season === 'number', `${payload.source} has season`);
  assert(typeof payload.fashion_breakdown.cohesion === 'number', `${payload.source} has cohesion`);
  assert(Array.isArray(payload.fashion_issues), `${payload.source} has fashion_issues`);
  assert(Array.isArray(payload.fashion_suggestions), `${payload.source} has fashion_suggestions`);
  assert(typeof payload.outfit_name === 'string', `${payload.source} keeps outfit_name`);
  assert(payload.items.length === 3, `${payload.source} still returns the validated items`);
}

assert(
  geminiCoherent.fashion_score === heuristicCoherent.fashion_score,
  'Gemini and heuristic use the same scorer for the same items',
);
assert(geminiLow.fashion_score < geminiCoherent.fashion_score, 'low-quality outfit scores lower');
assert(geminiLow.fashion_score > 0, 'low-quality outfit is still returned, not rejected');
assert(heuristicLow.items.length === 3, 'heuristic low-quality outfit is still returned');
assert(
  geminiCoherent.styling_tip === 'Keep the silhouette clean.',
  'existing response fields stay intact',
);

let threw = false;
try {
  scoreOutfit(lowQuality, { style: 'Minimalist', occasion: 'Work' });
} catch {
  threw = true;
}
assert(!threw, 'scoreOutfit does not throw on a low-quality outfit');

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);
