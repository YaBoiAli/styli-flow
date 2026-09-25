/**
 * Phase 2A: parse / validate / score / select among Gemini candidates.
 * Run: npm run test:outfit-score
 */
import { scoreOutfit, type OutfitScoreBreakdown } from '../_shared/catalog/outfitScoring.ts';
import { toFashionResponseFields } from './attachFashionScore.ts';
import {
  type AiOutfit,
  type ScoredOutfitCandidate,
  evaluateOutfitCandidates,
  parseGeminiOutfitCandidates,
  selectBestScoredCandidate,
} from './outfitCandidates.ts';

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

function validCandidate(
  index: number,
  score: number,
  extra: Partial<OutfitScoreBreakdown> = {},
): Extract<ScoredOutfitCandidate<number>, { valid: true }> {
  const sheet = breakdown(extra);
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
      items: [
        { product_id: `t-${index}`, reason: '' },
        { product_id: `b-${index}`, reason: '' },
        { product_id: `s-${index}`, reason: '' },
      ],
    },
    built: index,
  };
}

function invalidCandidate(index: number, reason = 'invalid_ai'): ScoredOutfitCandidate<number> {
  return { valid: false, index, reason };
}

const five = [
  validCandidate(0, 82),
  validCandidate(1, 76),
  validCandidate(2, 88),
  validCandidate(3, 70),
  validCandidate(4, 84),
];
assert(selectBestScoredCandidate(five)?.built === 2, 'TEST 1: highest score wins');

const mixed = [
  validCandidate(0, 82),
  invalidCandidate(1, 'budget'),
  validCandidate(2, 88),
  invalidCandidate(3, 'invalid_ai'),
  validCandidate(4, 84),
];
assert(selectBestScoredCandidate(mixed)?.built === 2, 'TEST 2: invalid candidates ignored');

const onlyOne = [
  invalidCandidate(0),
  invalidCandidate(1),
  validCandidate(2, 40),
  invalidCandidate(3),
];
assert(selectBestScoredCandidate(onlyOne)?.built === 2, 'TEST 3: only valid candidate selected');
assert(selectBestScoredCandidate(onlyOne)?.score === 40, 'TEST 10: low score still returned');

const cohesionTie = [
  validCandidate(0, 80, { cohesion: 60 }),
  validCandidate(1, 80, { cohesion: 90 }),
];
assert(selectBestScoredCandidate(cohesionTie)?.built === 1, 'TEST 4: higher cohesion wins ties');

const styleTie = [
  validCandidate(0, 80, { cohesion: 80, style: 60 }),
  validCandidate(1, 80, { cohesion: 80, style: 90 }),
];
assert(selectBestScoredCandidate(styleTie)?.built === 1, 'TEST 5: higher style wins after cohesion');

const colorTie = [
  validCandidate(0, 80, { cohesion: 80, style: 80, color: 60 }),
  validCandidate(1, 80, { cohesion: 80, style: 80, color: 90 }),
];
assert(selectBestScoredCandidate(colorTie)?.built === 1, 'TEST 6: higher color wins after style');

const fullTie = [
  validCandidate(0, 80, { cohesion: 80, style: 80, color: 80, proportion: 80 }),
  validCandidate(1, 80, { cohesion: 80, style: 80, color: 80, proportion: 80 }),
];
assert(selectBestScoredCandidate(fullTie)?.built === 0, 'TEST 7: earlier candidate wins full ties');

assert(selectBestScoredCandidate([invalidCandidate(0), invalidCandidate(1)]) === null, 'TEST 9: zero valid → no winner');

const parsedThree = parseGeminiOutfitCandidates(
  JSON.stringify({
    outfit_name: 'Batch',
    styling_tip: 'Tip',
    candidates: [
      { top_id: 't1', bottom_id: 'b1', shoes_id: 's1', outerwear_id: null, accessory_id: null, reason: 'A' },
      { top_id: 't2', bottom_id: 'b2', shoes_id: 's2', reason: 'B' },
      { top_id: 't3', bottom_id: 'b3', shoes_id: 's3', outerwear_id: 'o3', reason: 'C' },
    ],
  }),
);
assert(parsedThree.length === 3, 'TEST 8: fewer than five candidates are accepted');
assert(parsedThree[2].items.some((item) => item.product_id === 'o3'), 'optional outerwear id is kept');

const legacy = parseGeminiOutfitCandidates(
  JSON.stringify({
    outfit_name: 'Legacy',
    styling_tip: 'Old shape',
    items: [
      { product_id: 't1', reason: 'top' },
      { product_id: 'b1', reason: 'bottom' },
      { product_id: 's1', reason: 'shoes' },
    ],
  }),
);
assert(legacy.length === 1 && legacy[0].items[0].product_id === 't1', 'legacy single-outfit JSON still parses');

const skippedBad = parseGeminiOutfitCandidates(
  JSON.stringify({
    outfit_name: 'Mixed',
    styling_tip: 'Tip',
    candidates: [
      { top_id: 't1', bottom_id: 'b1', shoes_id: 's1', reason: 'ok' },
      { top_id: 'missing-rest' },
      { items: [{ product_id: 't2', reason: '' }, { product_id: 'b2', reason: '' }, { product_id: 's2', reason: '' }] },
    ],
  }),
);
assert(skippedBad.length === 2, 'malformed candidates are dropped instead of crashing');

let parseThrew = false;
try {
  parseGeminiOutfitCandidates('{"candidates":[]}');
} catch (err) {
  parseThrew = err instanceof Error && err.message === 'invalid_ai';
}
assert(parseThrew, 'zero parseable candidates throw invalid_ai for fallback');

const catalog = new Map([
  ['t1', { id: 't1', category: 'top' }],
  ['b1', { id: 'b1', category: 'bottom' }],
  ['s1', { id: 's1', category: 'shoes' }],
  ['t2', { id: 't2', category: 'top' }],
  ['b2', { id: 'b2', category: 'bottom' }],
  ['s2', { id: 's2', category: 'shoes' }],
]);

function fakeValidate(outfit: AiOutfit) {
  const seen = new Set<string>();
  const selected: Array<{ product: { id: string; category: string; name: string } }> = [];
  for (const item of outfit.items) {
    const product = catalog.get(item.product_id);
    if (!product) throw new Error('invalid_ai');
    if (seen.has(product.category)) throw new Error('invalid_ai');
    seen.add(product.category);
    selected.push({ product: { ...product, name: product.id } });
  }
  for (const required of ['top', 'bottom', 'shoes']) {
    if (!seen.has(required)) throw new Error('invalid_ai');
  }
  return { selected, totalPrice: 90 };
}

const evaluated = evaluateOutfitCandidates({
  outfits: [
    {
      outfit_name: 'Good',
      styling_tip: 'Tip',
      items: [
        { product_id: 't1', reason: '' },
        { product_id: 'b1', reason: '' },
        { product_id: 's1', reason: '' },
      ],
    },
    {
      outfit_name: 'Bad id',
      styling_tip: 'Tip',
      items: [
        { product_id: 'nope', reason: '' },
        { product_id: 'b1', reason: '' },
        { product_id: 's1', reason: '' },
      ],
    },
    {
      outfit_name: 'Duplicate category',
      styling_tip: 'Tip',
      items: [
        { product_id: 't1', reason: '' },
        { product_id: 't2', reason: '' },
        { product_id: 's1', reason: '' },
      ],
    },
  ],
  excludeIds: new Set<string>(),
  validate: fakeValidate,
  productsOf: (built) => built.selected.map(({ product }) => product),
  score: (products) =>
    scoreOutfit(
      products.map((product, index) => ({
        category: product.category,
        name: ['Black Cotton Tee', 'Blue Straight Jeans', 'White Canvas Sneakers'][index] ?? product.name,
        colors: index === 0 ? ['black'] : index === 1 ? ['blue'] : ['white'],
        color: index === 0 ? 'black' : index === 1 ? 'blue' : 'white',
        formality: 'casual',
        style_tags: ['casual'],
        season_tags: ['all_season'],
      })),
      { style: 'Casual', occasion: 'Everyday' },
    ),
});

assert(evaluated.candidates.filter((candidate) => !candidate.valid).length === 2, 'TEST 11: hard validation still rejects bad IDs/categories');
assert(evaluated.winner !== null, 'one valid candidate survives validation');

const fields = toFashionResponseFields(evaluated.winner!.fashion);
assert(typeof fields.fashion_score === 'number', 'TEST 12: fashion_score present');
assert(typeof fields.fashion_breakdown.style === 'number', 'TEST 12: fashion_breakdown present');
assert(Array.isArray(fields.fashion_issues), 'TEST 12: fashion_issues present');
assert(Array.isArray(fields.fashion_suggestions), 'TEST 12: fashion_suggestions present');

const noneValid = evaluateOutfitCandidates({
  outfits: [
    {
      outfit_name: 'Bad',
      styling_tip: 'Tip',
      items: [
        { product_id: 'nope', reason: '' },
        { product_id: 'b1', reason: '' },
        { product_id: 's1', reason: '' },
      ],
    },
  ],
  excludeIds: new Set<string>(),
  validate: fakeValidate,
  productsOf: (built) => built.selected.map(({ product }) => product),
  score: () => ({
    score: 10,
    breakdown: breakdown(),
    issues: [],
    suggestions: [],
  }),
});
assert(noneValid.winner === null, 'TEST 9: zero structurally valid candidates → no winner (heuristic path)');

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);
