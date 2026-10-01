/**
 * Footwear preference: default include, explicit none.
 * Run: npm run test:outfit-score
 */
import {
  assertNoForbiddenFootwear,
  assertValidOutfitCategories,
  excludeFootwear,
  isFootwearProduct,
  liveRetrievalCategories,
  parseColorPreference,
  parseFootwearPreference,
  requiredOutfitCategories,
  sanitizeCriticForFootwear,
} from './footwearPreference.ts';
import { selectVisualAnalysisTargets } from '../_shared/catalog/visualAttributes.ts';
import { evaluateOutfitCandidates, parseGeminiOutfitCandidates } from './outfitCandidates.ts';
import type { CatalogProduct } from './catalog.ts';

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

assert(parseFootwearPreference(undefined) === 'include', '1: missing preference defaults to include');
assert(parseFootwearPreference('include') === 'include', '1b: include stays include');
assert(parseFootwearPreference('none') === 'none', '1c: none is explicit');
assert(parseFootwearPreference('other') === 'include', '13: unknown value defaults to include');
assert(parseColorPreference(undefined) === 'style_first', 'color: missing defaults to style_first');
assert(parseColorPreference('complexion') === 'complexion', 'color: complexion is explicit');
assert(parseColorPreference('style_first') === 'style_first', 'color: style_first stays');
assert(parseColorPreference('other') === 'style_first', 'color: unknown defaults to style_first');

assert(
  requiredOutfitCategories('include').join(',') === 'top,bottom,shoes',
  '1d: include requires shoes',
);
assert(requiredOutfitCategories('none').join(',') === 'top,bottom', '3: none requires top+bottom only');
assert(
  liveRetrievalCategories('none').join(',') === 'top,bottom',
  '7: live retrieval categories omit shoes',
);
assert(
  liveRetrievalCategories('include').includes('shoes'),
  '8: include retrieval still searches shoes',
);

let threw = false;
try {
  assertValidOutfitCategories(['top', 'bottom', 'shoes'], 'include');
} catch {
  threw = true;
}
assert(!threw, '2: include + top/bottom/shoes is valid');

threw = false;
try {
  assertValidOutfitCategories(['top', 'bottom'], 'none');
} catch {
  threw = true;
}
assert(!threw, '3b: none + top/bottom is valid');

threw = false;
try {
  assertValidOutfitCategories(['top', 'bottom', 'shoes'], 'none');
} catch (err) {
  threw = err instanceof Error && err.message === 'invalid_ai';
}
assert(threw, '4: none + shoes is invalid (not silently stripped)');

threw = false;
try {
  assertValidOutfitCategories(['top'], 'none');
} catch (err) {
  threw = err instanceof Error && err.message === 'invalid_ai';
}
assert(threw, '5: none + top only is invalid');

threw = false;
try {
  assertValidOutfitCategories(['bottom'], 'none');
} catch (err) {
  threw = err instanceof Error && err.message === 'invalid_ai';
}
assert(threw, '6: none + bottom only is invalid');

threw = false;
try {
  assertValidOutfitCategories(['top', 'bottom'], 'include');
} catch (err) {
  threw = err instanceof Error && err.message === 'invalid_ai';
}
assert(threw, '13b: include still requires shoes');

const stored = [
  { category: 'top' },
  { category: 'bottom' },
  { category: 'shoes' },
];
assert(
  excludeFootwear(stored, 'none').every((product) => product.category !== 'shoes'),
  '9: fallback catalog drops shoes when none',
);
assert(
  excludeFootwear(
    [
      { category: 'top', name: 'Tee' },
      { category: 'accessory', name: 'White Sneakers', subcategory: 'sneakers' },
    ],
    'none',
  ).every((product) => !isFootwearProduct(product)),
  '9c: hybrid fallback drops footwear even if category is not shoes',
);

const parsedNone = parseGeminiOutfitCandidates(
  JSON.stringify({
    outfit_name: 'Barefoot',
    styling_tip: 'Tip',
    candidates: [{ top_id: 't1', bottom_id: 'b1', shoes_id: null, reason: 'clean' }],
  }),
  { requireShoes: false },
);
assert(parsedNone.length === 1 && parsedNone[0].items.length === 2, 'none Gemini top+bottom parses');

const parsedWithShoes = parseGeminiOutfitCandidates(
  JSON.stringify({
    outfit_name: 'With shoes',
    styling_tip: 'Tip',
    candidates: [{ top_id: 't1', bottom_id: 'b1', shoes_id: 's1', reason: 'oops' }],
  }),
  { requireShoes: false },
);
const catalog = new Map<string, CatalogProduct>([
  ['t1', { id: 't1', category: 'top' } as CatalogProduct],
  ['b1', { id: 'b1', category: 'bottom' } as CatalogProduct],
  ['s1', { id: 's1', category: 'shoes' } as CatalogProduct],
]);
const evaluated = evaluateOutfitCandidates({
  outfits: parsedWithShoes,
  excludeIds: new Set<string>(),
  validate: (outfit) => {
    const seen = new Set(outfit.items.map((item) => catalog.get(item.product_id)?.category));
    assertValidOutfitCategories(
      [...seen].filter((category): category is NonNullable<typeof category> => Boolean(category)),
      'none',
    );
    return outfit;
  },
  productsOf: (built) => built.items.map((item) => catalog.get(item.product_id)!),
  score: () => ({
    score: 80,
    breakdown: {
      style: 80,
      color: 80,
      proportion: 80,
      skinTone: 80,
      occasion: 80,
      fit: 80,
      season: 80,
      cohesion: 80,
    },
    issues: [],
    suggestions: [],
  }),
});
assert(evaluated.winner === null, '10: none candidate that includes shoes is rejected');
assert(
  parsedWithShoes[0].items.some((item) => item.product_id === 's1'),
  '10b: parse does not silently strip the shoe before validation',
);

const validNone = evaluateOutfitCandidates({
  outfits: parsedNone,
  excludeIds: new Set<string>(),
  validate: (outfit) => {
    const products = outfit.items.map((item) => catalog.get(item.product_id)!);
    assertValidOutfitCategories(
      products.map((product) => product.category),
      'none',
    );
    assertNoForbiddenFootwear(products, 'none');
    return outfit;
  },
  productsOf: (built) => built.items.map((item) => catalog.get(item.product_id)!),
  score: () => ({
    score: 80,
    breakdown: {
      style: 80,
      color: 80,
      proportion: 80,
      skinTone: 80,
      occasion: 80,
      fit: 80,
      season: 80,
      cohesion: 80,
    },
    issues: [],
    suggestions: [],
  }),
});
assert(validNone.winner !== null, 'none still produces a complete top+bottom outfit');
assert(
  validNone.winner!.outfit.items.every((item) => catalog.get(item.product_id)?.category !== 'shoes'),
  'final no-shoes outfit contains zero footwear items',
);

assert(isFootwearProduct({ category: 'accessory', name: 'White Canvas Sneakers' }), 'footwear by name');
assert(!isFootwearProduct({ category: 'top', name: 'Oxford Shirt' }), 'oxford shirt is not footwear');

const sneakerAsAccessory = evaluateOutfitCandidates({
  outfits: [
    {
      outfit_name: 'Leak',
      styling_tip: 'Tip',
      items: [
        { product_id: 't1', reason: 't' },
        { product_id: 'b1', reason: 'b' },
        { product_id: 'sneaker-acc', reason: 'oops' },
      ],
    },
  ],
  excludeIds: new Set<string>(),
  validate: (outfit) => {
    const products = outfit.items.map((item) =>
      item.product_id === 'sneaker-acc'
        ? { category: 'accessory', name: 'White Canvas Sneakers' }
        : catalog.get(item.product_id)!,
    );
    assertNoForbiddenFootwear(products, 'none');
    return outfit;
  },
  productsOf: (built) => built.items,
  score: () => ({
    score: 80,
    breakdown: {
      style: 80,
      color: 80,
      proportion: 80,
      skinTone: 80,
      occasion: 80,
      fit: 80,
      season: 80,
      cohesion: 80,
    },
    issues: [],
    suggestions: [],
  }),
});
assert(sneakerAsAccessory.winner === null, 'miscategorized sneaker still rejected when No Shoes');

const critic = sanitizeCriticForFootwear(
  {
    overall_assessment: 'acceptable',
    style_match: 8,
    color_harmony: 8,
    proportion: 8,
    occasion_match: 8,
    cohesion: 8,
    strengths: ['Top and bottom create a cohesive silhouette.'],
    issues: [{ type: 'other', severity: 'major' }],
    recommendations: ['Add shoes to complete the outfit.', 'Keep the navy top.'],
  },
  'none',
);
assert(
  !critic.recommendations.some((line) => /add shoes/i.test(line)),
  '11: critic recommendations drop missing-shoes advice',
);
assert(
  critic.issues.every((issue) => issue.product_id || issue.type !== 'other'),
  '11b: unanchored other issues dropped for none',
);
assert(
  sanitizeCriticForFootwear(critic, 'include').recommendations.length >= critic.recommendations.length,
  '11c: include does not strip critic copy',
);

const visualTargets = selectVisualAnalysisTargets(
  [
    { id: 't1', category: 'top', image_url: 'https://cdn.example.com/t.jpg' },
    { id: 'b1', category: 'bottom', image_url: 'https://cdn.example.com/b.jpg' },
    { id: 's1', category: 'shoes', image_url: 'https://cdn.example.com/s.jpg' },
  ],
  { footwearPreference: 'none' },
);
assert(
  visualTargets.every((product) => product.category !== 'shoes'),
  '27: no-shoes does not analyze footwear',
);

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
