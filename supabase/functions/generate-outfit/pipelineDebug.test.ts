/**
 * Pipeline debug pass: visual diagnostics, filter drop reasons, Gemini stages, fallback.
 * Run: npx tsx supabase/functions/generate-outfit/pipelineDebug.test.ts
 * No live Channel3. No Gemini network.
 */
import {
  applyVisualRecord,
  interpretVisualGeminiPayload,
  type VisualTarget,
} from '../_shared/catalog/visualAttributes.ts';
import {
  GeminiGenerationError,
  httpErrorType,
  inspectGeminiPayload,
  normalizeImageMimeType,
  readGeminiText,
} from '../_shared/geminiResponse.ts';
import {
  evaluateOutfitCandidates,
  parseGeminiOutfitCandidates,
  tryParseGeminiOutfitCandidates,
  type AiOutfit,
} from './outfitCandidates.ts';
import {
  rankWorkingPoolDetailed,
  shortlistForGemini,
  type BudgetPlan,
} from './candidateShortlist.ts';
import type { CatalogProduct } from './catalog.ts';
import {
  fallbackReasonForGemini,
  generationModeForResponse,
  genLog,
  logFinalOutfit,
} from './genTrace.ts';
import { assertNoForbiddenFootwear } from './footwearPreference.ts';

declare const process: { exit(code?: number): void };

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

function geminiPayload(parts: Array<{ text?: string; thought?: boolean }>, extra: Record<string, unknown> = {}) {
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts },
        ...extra,
      },
    ],
  };
}

const visualJson = {
  products: [
    {
      product_id: 'p1',
      confidence: 0.91,
      visual_attributes: {
        primary_color: 'black',
        color_family: 'black',
        fit: 'relaxed',
        silhouette: 'straight',
        pattern: 'solid',
        confidence: 0.91,
      },
    },
  ],
};

const thoughtSuccess = interpretVisualGeminiPayload(
  geminiPayload([{ thought: true, text: JSON.stringify(visualJson) }]),
  new Set(['p1']),
);
assert(thoughtSuccess.ok && thoughtSuccess.records[0]?.product_id === 'p1', '1: valid visual request succeeds (thought JSON)');
assert(
  thoughtSuccess.ok && thoughtSuccess.records[0]?.attributes.fit === 'relaxed',
  '1b: vision JSON yields structured attributes',
);

const visibleSuccess = interpretVisualGeminiPayload(
  geminiPayload([{ thought: false, text: JSON.stringify(visualJson) }]),
  new Set(['p1']),
);
assert(visibleSuccess.ok, '1c: visible non-thought JSON still succeeds');

const emptyVision = interpretVisualGeminiPayload(geminiPayload([]));
assert(
  !emptyVision.ok && emptyVision.stage === 'gemini_response' && emptyVision.error_type.includes('EMPTY_TEXT'),
  '2: empty vision payload produces a useful diagnostic',
);
assert(httpErrorType(400) === 'HTTP_400', '2b: HTTP 400 is labeled HTTP_400');
const requestFail = new GeminiGenerationError('request', 'HTTP_400', { status_code: 400, message: 'ai' });
assert(requestFail.stage === 'request' && requestFail.status_code === 400, '2c: request failure is a request-stage error');

const malformedVision = interpretVisualGeminiPayload(
  geminiPayload([{ text: '{not-json' }]),
);
assert(
  !malformedVision.ok && malformedVision.stage === 'json_parse' && malformedVision.error_type === 'invalid_json',
  '3: malformed vision JSON is handled',
);

const target: VisualTarget = {
  id: 'p1',
  category: 'bottom',
  image_url: '',
  fit: 'slim',
  silhouette: null,
  pattern: 'unknown',
};
assert(thoughtSuccess.ok, '4-pre: visual records exist for merge');
if (thoughtSuccess.ok) {
  const merged = applyVisualRecord(target, thoughtSuccess.records[0]);
  assert(merged.visual_attributes?.fit === 'relaxed', '4: valid visual attributes merge onto the product');
  assert(merged.fit === 'slim', '5: existing reliable catalog fit is preserved');
  assert(merged.silhouette === 'straight', '4b: empty catalog silhouette is filled from visual');
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
    subcategory: extra.subcategory ?? (category === 'bottom' ? 'jeans' : category === 'shoes' ? 'sneakers' : 't-shirt'),
    price: extra.price ?? 40,
    currency: 'USD',
    color: extra.color ?? 'black',
    colors: extra.colors ?? ['black'],
    material: extra.material ?? 'cotton',
    description: extra.description ?? null,
    gender: extra.gender ?? 'men',
    image_url: extra.image_url ?? 'https://cdn.example.com/a.jpg',
    purchase_url: extra.purchase_url ?? 'https://shop.example.com/p/1',
    style_tags: extra.style_tags ?? [],
    occasion_tags: extra.occasion_tags ?? [],
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

const budget: BudgetPlan = { outfit: 150, shoes: null };
const emptyIds = new Set<string>();
const tops = [
  product('hoodie-1', 'top', { name: 'Oversized Hoodie', subcategory: 'hoodie', style_tags: [] }),
  product('tee-1', 'top', { name: 'Graphic Tee', subcategory: 't-shirt', style_tags: [] }),
];
const shoes = [product('sneaker-1', 'shoes', { name: 'Black Sneakers', style_tags: [] })];
const baggyBottoms = [
  product('youngla', 'bottom', { name: 'Baggy Joggers', brand: 'YoungLA', subcategory: 'joggers', style_tags: [] }),
  product('uniqlo', 'bottom', { name: 'Baggy Jeans', brand: 'Uniqlo', subcategory: 'jeans', style_tags: [] }),
  product('polar', 'bottom', { name: 'Baggy Jeans', brand: 'Polar Skate Co.', subcategory: 'jeans', style_tags: [] }),
  product('kani', 'bottom', { name: 'Hoop Joggers', brand: 'Karl Kani', subcategory: 'joggers', style_tags: [] }),
  product('dickies', 'bottom', { name: 'Madison Baggy Fit Jeans', brand: 'Dickies', subcategory: 'jeans', style_tags: [] }),
];
const pricey = product('pricey-bottom', 'bottom', {
  name: 'Baggy Jeans',
  brand: 'Luxury',
  price: 400,
  style_tags: [],
});
const weakOffice = product('office-chino', 'bottom', {
  name: 'Office Dress Chino',
  brand: 'WorkWear',
  subcategory: 'chinos',
  style_tags: ['old money'],
  occasion_tags: ['work'],
});

const ranked = rankWorkingPoolDetailed({
  products: [...tops, ...baggyBottoms, pricey, weakOffice, ...shoes],
  style: 'Streetwear',
  occasion: 'Everyday',
  budget,
  excludeIds: emptyIds,
  skinTone: null,
  footwearPreference: 'include',
  colorPreference: 'style_first',
});

assert(
  ranked.drops.every((drop) => Boolean(drop.reason) && Boolean(drop.product_id)),
  '6: every filtered product has a deterministic reason',
);
assert(
  ranked.drops.some((drop) => drop.product_id === 'pricey-bottom' && drop.reason === 'over_budget'),
  '6b: over-budget product is dropped as over_budget',
);

const keptBottomIds = ranked.products.filter((row) => row.category === 'bottom').map((row) => row.id);
assert(
  baggyBottoms.every((row) => keptBottomIds.includes(row.id)),
  '7: missing style_tags does not automatically reject otherwise valid bottoms',
);
assert(
  keptBottomIds.includes('youngla') &&
    keptBottomIds.includes('uniqlo') &&
    keptBottomIds.includes('polar') &&
    keptBottomIds.includes('kani') &&
    keptBottomIds.includes('dickies'),
  '8: valid baggy jeans/joggers survive when they satisfy the request',
);
assert(
  !keptBottomIds.includes('office-chino') ||
    ranked.drops.some((drop) => drop.product_id === 'office-chino'),
  '8b: a non-streetwear chino is not silently kept without a reason',
);

const requestErr = new GeminiGenerationError('request', 'HTTP_400', { status_code: 400, message: 'ai' });
const parseFail = tryParseGeminiOutfitCandidates('{not json');
assert(requestErr.stage === 'request' && parseFail.ok === false && parseFail.stage === 'parse', '9: request failure is distinguishable from parser failure');
assert(parseFail.error_type === 'invalid_json', '9b: malformed JSON is parse-stage invalid_json');

const validOutfits = parseGeminiOutfitCandidates(
  JSON.stringify({
    outfit_name: 'Look',
    styling_tip: 'Tip',
    candidates: [
      { top_id: 't1', bottom_id: 'b1', shoes_id: 's1', reason: 'ok' },
      { items: [{ product_id: 't2', reason: '' }, { product_id: 'b2', reason: '' }, { product_id: 's2', reason: '' }] },
    ],
  }),
);
assert(validOutfits.length === 2, '10: valid Gemini candidates are parsed');

const malformedOutfit = tryParseGeminiOutfitCandidates('{"candidates":');
assert(!malformedOutfit.ok && malformedOutfit.stage === 'parse', '11: malformed Gemini response is handled');

const schemaFail = tryParseGeminiOutfitCandidates(JSON.stringify({ foo: 1 }));
assert(!schemaFail.ok && schemaFail.stage === 'schema', '11b: missing candidate schema is schema-stage');

const invalidCandidates = tryParseGeminiOutfitCandidates(JSON.stringify({ candidates: [{ top_id: 'only-top' }] }));
assert(
  !invalidCandidates.ok && invalidCandidates.stage === 'candidate_validation',
  '12: candidate validation failures are distinguishable from provider failures',
);
assert(requestErr.stage !== invalidCandidates.stage, '12b: provider vs validation stages differ');

const catalog = new Map([
  ['t1', { id: 't1', category: 'top' }],
  ['b1', { id: 'b1', category: 'bottom' }],
  ['s1', { id: 's1', category: 'shoes' }],
]);
const evaluated = evaluateOutfitCandidates({
  outfits: [
    {
      outfit_name: 'Bad',
      styling_tip: '',
      items: [
        { product_id: 'missing', reason: '' },
        { product_id: 'b1', reason: '' },
        { product_id: 's1', reason: '' },
      ],
    },
  ],
  excludeIds: emptyIds,
  validate: (outfit: AiOutfit) => {
    const selected = outfit.items.map((item) => catalog.get(item.product_id));
    if (selected.some((row) => !row)) throw new Error('invalid_ai');
    return { selected: selected.map((product) => ({ product: product! })), totalPrice: 90 };
  },
  productsOf: (built) => built.selected.map((row) => row.product),
  score: () => ({
    score: 70,
    breakdown: {
      style: 70,
      color: 70,
      proportion: 70,
      skinTone: 70,
      occasion: 70,
      fit: 70,
      season: 70,
      cohesion: 70,
    },
    issues: [],
    suggestions: [],
  }),
});
assert(
  evaluated.candidates[0]?.valid === false && requestErr.stage === 'request',
  '12c: post-parse validation failure is not a provider request failure',
);

assert(
  fallbackReasonForGemini({ geminiOutfits: null, requestFailed: false }) === 'gemini_no_candidates',
  '13: Gemini zero-candidate path is gemini_no_candidates',
);
const fallbackLogs: string[] = [];
const originalLog = console.log;
console.log = (...args: unknown[]) => {
  fallbackLogs.push(args.map(String).join(' '));
};
genLog('GEN_FALLBACK', 'trace1', {
  reason: 'gemini_no_candidates',
  mode: 'heuristic',
  top_candidates: 7,
  bottom_candidates: 3,
  shoe_candidates: 7,
});
genLog('GEN_FALLBACK_SELECTION', 'trace1', { top: 'elite', bottom: 'youngla', shoes: 'puma' });
logFinalOutfit(
  'trace1',
  {
    source: 'channel3_live',
    items: 3,
    score: 74,
    revision_attempted: false,
    revision_accepted: false,
    generation_mode: generationModeForResponse(true),
  },
  [{ category: 'top', product_id: 'elite', brand: 'Elite Eleven', price: 50 }],
);
console.log = originalLog;
assert(
  fallbackLogs.some((line) => line.includes('[GEN_FALLBACK]') && line.includes('reason=gemini_no_candidates') && line.includes('mode=heuristic')),
  '13b: Gemini zero-candidate path logs fallback',
);
assert(
  fallbackLogs.some((line) => line.includes('[GEN_FINAL]') && line.includes('generation_mode=heuristic_fallback')),
  '14: final response identifies generation_mode=heuristic_fallback',
);
assert(generationModeForResponse(false) === 'gemini', '14b: successful Gemini path is not labeled fallback');

const noShoeShortlist = shortlistForGemini({
  products: [
    ...tops,
    baggyBottoms[0],
    product('sneaker-sneak', 'shoes', { name: 'White Sneakers', price: 40 }),
    product('fake-shoe', 'accessory', { name: 'Canvas Sneakers', subcategory: 'sneakers', price: 30 }),
  ],
  style: 'Streetwear',
  occasion: 'Everyday',
  budget,
  excludeIds: emptyIds,
  skinTone: null,
  footwearPreference: 'none',
  colorPreference: 'style_first',
});
assert(noShoeShortlist.every((row) => row.category !== 'shoes'), '15: No Shoes hard constraint remains enforced');
assertNoForbiddenFootwear(noShoeShortlist, 'none');
assert(
  noShoeShortlist.every((row) => row.id !== 'fake-shoe'),
  '15b: footwear does not enter the pool when disabled',
);

assert(normalizeImageMimeType('image/jpg') === 'image/jpeg', 'mime: image/jpg normalizes to image/jpeg');
assert(readGeminiText(geminiPayload([{ thought: true, text: '{"a":1}' }])) === '{"a":1}', 'extract: thought JSON is usable');
assert(inspectGeminiPayload(geminiPayload([])).text === '', 'extract: empty parts stay empty');

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
