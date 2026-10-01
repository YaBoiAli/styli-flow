/**
 * Phase A+B pipeline quality: shortlist, rebuild, budget, No Shoes, logs.
 * Run: npx tsx supabase/functions/generate-outfit/pipelineQuality.test.ts
 */
import { productStyleAffinity, scoreOutfit, UNCERTAIN_DIMENSION } from '../_shared/catalog/outfitScoring.ts';
import { emptyVisualAttributes } from '../_shared/catalog/visualAttributes.ts';
import {
  asNumber,
  fitsBudget,
  groupByCategory,
  rankWorkingPool,
  shortlistForGemini,
  type BudgetPlan,
} from './candidateShortlist.ts';
import type { CatalogProduct } from './catalog.ts';
import { relevanceScore } from './catalog.ts';
import { productGroupKey, type PreviousOutfitItem } from './outfitDiversity.ts';
import {
  evaluateOutfitCandidates,
  selectBestScoredCandidate,
  type AiOutfit,
} from './outfitCandidates.ts';
import { logCandidateScores, logFinalOutfit, logGeminiPool } from './genTrace.ts';
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

const budget: BudgetPlan = { outfit: 150, shoes: null };
const emptyIds = new Set<string>();

function shortlist(products: CatalogProduct[], previous: PreviousOutfitItem[] = [], footwear: 'include' | 'none' = 'include') {
  return shortlistForGemini({
    products,
    style: 'Streetwear',
    occasion: 'Everyday',
    budget,
    excludeIds: emptyIds,
    skinTone: null,
    footwearPreference: footwear,
    colorPreference: 'style_first',
    previousOutfit: previous,
  });
}

const joggers = Array.from({ length: 8 }, (_, index) =>
  product(`jogger-${index}`, 'bottom', {
    name: '2063 Baggy Joggers',
    subcategory: 'joggers',
    price: 48,
    style_tags: ['streetwear'],
  }),
);
const cargo = product('cargo-1', 'bottom', {
  name: 'Relaxed Cargo Pants',
  subcategory: 'cargos',
  price: 55,
  style_tags: ['streetwear'],
});
const jeans = product('jeans-1', 'bottom', {
  name: 'Straight Jeans',
  subcategory: 'jeans',
  price: 52,
  style_tags: ['streetwear'],
});
const trousers = product('trouser-1', 'bottom', {
  name: 'Relaxed Trousers',
  subcategory: 'trousers',
  price: 60,
  style_tags: ['streetwear'],
});
const weakChino = product('chino-1', 'bottom', {
  name: 'Office Dress Chino',
  subcategory: 'chinos',
  price: 22,
  style_tags: ['old money'],
  occasion_tags: ['work'],
});
const tops = [
  product('hoodie-1', 'top', { name: 'Oversized Hoodie', subcategory: 'hoodie', price: 45 }),
  product('tee-1', 'top', { name: 'Graphic Tee', subcategory: 't-shirt', price: 28 }),
];
const shoes = [
  product('sneaker-1', 'shoes', { name: 'Black Sneakers', price: 40 }),
  product('boot-1', 'shoes', { name: 'Leather Boots', subcategory: 'boots', price: 70 }),
];

const spread = shortlist([...tops, ...joggers, cargo, jeans, trousers, weakChino, ...shoes]);
const bottomIds = spread.filter((row) => row.category === 'bottom').map((row) => row.id);
const bottomGroups = new Set(
  spread.filter((row) => row.category === 'bottom').map((row) => productGroupKey(row)),
);
assert(bottomGroups.size >= 3, '9: near-identical joggers do not consume the whole shortlist');
assert(bottomIds.includes('cargo-1') && bottomIds.includes('jeans-1'), '9b: strong alternatives enter the shortlist');
assert(bottomIds.filter((id) => id.startsWith('jogger-')).length < 7, '9c: baggy joggers are capped');
assert(!bottomIds.includes('chino-1'), '10: diversity does not pick a weak product over stronger ones');

const cheapWeak = product('cheap-weak', 'bottom', {
  name: 'Generic Knit Bottom',
  price: 18,
  style_tags: [],
  occasion_tags: [],
});
const strongFifty = product('strong-50', 'bottom', {
  name: 'Streetwear Baggy Jeans',
  price: 50,
  style_tags: ['streetwear'],
  subcategory: 'jeans',
});
const cheapPool = shortlist([...tops, cheapWeak, strongFifty, ...shoes]);
assert(
  cheapPool.some((row) => row.id === 'strong-50'),
  '12: a strong $50 item is eligible',
);
assert(
  !cheapPool.some((row) => row.id === 'cheap-weak') ||
    (cheapPool.find((row) => row.id === 'strong-50') &&
      relevanceScore(strongFifty, ['streetwear'], 'Everyday') >
        relevanceScore(cheapWeak, ['streetwear'], 'Everyday')),
  '12b: cheap products are not automatically preferred',
);
assert(
  budgetFitEqual(),
  '18: in-budget cheap and mid-price items are equally feasible',
);

function budgetFitEqual(): boolean {
  const cheapOutfit = [tops[0], strongFifty, shoes[0]];
  const midOutfit = [tops[0], cargo, shoes[0]];
  return fitsBudget(budget, cheapOutfit) && fitsBudget(budget, midOutfit);
}

const visualStrong = product('visual-cargo', 'bottom', {
  name: 'Utility Pant',
  subcategory: 'pants',
  price: 54,
  style_tags: [],
  visual_attributes: {
    ...emptyVisualAttributes(0.82),
    confidence: 0.82,
    fit: 'relaxed',
    silhouette: 'straight',
    aesthetics: ['streetwear'],
  },
});
const visualWeak = product('visual-plain', 'bottom', {
  name: 'Utility Pant Twin',
  subcategory: 'pants',
  price: 54,
  style_tags: [],
  visual_attributes: {
    ...emptyVisualAttributes(0.2),
    confidence: 0.2,
    aesthetics: ['streetwear'],
  },
});
const visualRanked = rankWorkingPool({
  products: [...tops, visualStrong, visualWeak, ...shoes],
  style: 'Streetwear',
  occasion: 'Everyday',
  budget,
  excludeIds: emptyIds,
  skinTone: null,
  footwearPreference: 'include',
  colorPreference: 'style_first',
});
const visualOrder = visualRanked.filter((row) => row.category === 'bottom').map((row) => row.id);
assert(visualOrder[0] === 'visual-cargo', '11: usable visual attributes can affect ranking');
assert(
  productStyleAffinity(visualWeak, 'Streetwear') === UNCERTAIN_DIMENSION ||
    productStyleAffinity(visualWeak, 'Streetwear') <= productStyleAffinity(visualStrong, 'Streetwear'),
  '11b: low-confidence visual does not overpower catalog metadata',
);

const previous: PreviousOutfitItem[] = [
  { product_id: 'jogger-0', name: '2063 Baggy Joggers', brand: 'Acme', category: 'bottom' },
];
const rebuilt = shortlist([...tops, ...joggers.slice(0, 2), cargo, jeans, ...shoes], previous);
const rebuiltBottoms = rebuilt.filter((row) => row.category === 'bottom');
assert(rebuiltBottoms[0]?.id !== 'jogger-0', '13: previous product is not the top-tier pick when alternatives exist');
assert(
  rebuiltBottoms.some((row) => row.id === 'cargo-1' || row.id === 'jeans-1'),
  '14: strong alternatives replace the previous bottom',
);

const onlyPrevious = shortlist(
  [...tops, joggers[0], ...shoes],
  [{ product_id: 'jogger-0', name: '2063 Baggy Joggers', brand: 'Acme', category: 'bottom' }],
);
assert(
  onlyPrevious.some((row) => row.id === 'jogger-0'),
  '15: previous product can still be reused if no viable alternative exists',
);

const normal = shortlist([...tops, joggers[0], cargo, ...shoes], []);
assert(normal.some((row) => row.id === 'jogger-0'), '16: normal generation still includes the strongest bottom');

const overBudgetShoes = product('pricey-shoe', 'shoes', { name: 'Limited Sneakers', price: 90 });
const overBudgetTop = product('pricey-top', 'top', { name: 'Oversized Hoodie', price: 80, subcategory: 'hoodie' });
const overBudgetBottom = product('pricey-bottom', 'bottom', {
  name: 'Baggy Jeans',
  price: 80,
  subcategory: 'jeans',
});
assert(
  !fitsBudget(budget, [overBudgetTop, overBudgetBottom, overBudgetShoes]),
  '17: complete outfit over the total budget is rejected',
);
assert(
  fitsBudget(budget, [tops[0], cargo, shoes[0]]),
  '17b: a valid combo stays within the total outfit budget',
);
assert(
  fitsBudget({ outfit: 120, shoes: null }, [tops[0], cargo, shoes[1]]) ===
    asNumber(tops[0].price) + asNumber(cargo.price) + asNumber(shoes[1].price) <= 120,
  '19: shoes count toward the total outfit budget when included',
);

const noShoePool = [
  ...tops,
  cargo,
  product('sneaker-sneak', 'shoes', { name: 'White Sneakers', price: 40 }),
  product('fake-shoe', 'accessory', { name: 'Canvas Sneakers', subcategory: 'sneakers', price: 30 }),
];
const noShoes = shortlist(noShoePool, [], 'none');
assert(
  noShoes.every((row) => row.category !== 'shoes'),
  '20: No Shoes is a hard rejection of the shoes category',
);
assert(
  noShoes.every((row) => row.id !== 'fake-shoe'),
  '21: footwear does not enter retrieval/shortlist when disabled',
);
assertNoForbiddenFootwear(noShoes, 'none');
assert(
  noShoes.every((row) => row.category !== 'shoes' && row.id !== 'fake-shoe'),
  '22: no footwear can enter the working pool',
);

const logs: string[] = [];
const originalLog = console.log;
console.log = (...args: unknown[]) => {
  logs.push(args.map(String).join(' '));
};
logGeminiPool('abc123', 'top', [
  {
    product_id: 'hoodie-1',
    category: 'top',
    brand: 'Acme',
    price: 45,
    relevance_score: 12,
    style_score: 8,
    occasion_score: 3,
    visual_confidence: 0.8,
    shortlist_rank: 1,
  },
]);
logCandidateScores(
  'abc123',
  [
    { index: 0, valid: true, score: 84 },
    { index: 1, valid: true, score: 81 },
    { index: 2, valid: false },
    { index: 3, valid: true, score: 86 },
  ],
  3,
);
logFinalOutfit(
  'abc123',
  {
    source: 'channel3_live',
    items: 3,
    score: 86,
    revision_attempted: false,
    revision_accepted: false,
    generation_mode: 'gemini',
  },
  [{ category: 'top', product_id: 'hoodie-1', brand: 'Acme', price: 45 }],
);
console.log = originalLog;

assert(logs.some((line) => line.includes('[GEN_GEMINI_POOL]') && line.includes('hoodie-1')), '23: final Gemini pool is logged');
assert(logs.every((line) => !/https?:\/\//.test(line)), '23b: pool logs do not include image URLs');
assert(logs.some((line) => line.includes('[GEN_SCORE]') && line.includes('candidate=3') && line.includes('score=86')), '25: candidate scores are logged');
assert(logs.some((line) => line.includes('[GEN_SCORE]') && line.includes('winner=3')), '26: winner index is logged');
assert(logs.some((line) => line.includes('[GEN_FINAL]') && line.includes('source=channel3_live')), '20-final: final outfit source is logged');

const outfits: AiOutfit[] = [
  {
    outfit_name: 'A',
    styling_tip: '',
    items: [
      { product_id: 'tee-1', reason: '' },
      { product_id: 'jeans-1', reason: '' },
      { product_id: 'sneaker-1', reason: '' },
    ],
  },
  {
    outfit_name: 'B',
    styling_tip: '',
    items: [
      { product_id: 'hoodie-1', reason: '' },
      { product_id: 'cargo-1', reason: '' },
      { product_id: 'boot-1', reason: '' },
    ],
  },
];
const catalog = new Map(
  [...tops, cargo, jeans, ...shoes].map((row) => [row.id, row]),
);
const evaluated = evaluateOutfitCandidates({
  outfits,
  excludeIds: emptyIds,
  validate: (outfit) => outfit.items.map((item) => catalog.get(item.product_id)!),
  productsOf: (built) => built,
  score: (products) => scoreOutfit(products, { style: 'Streetwear', occasion: 'Everyday' }),
});
assert(evaluated.count === 2, '24: candidate count is available after Gemini returns');
assert(evaluated.winner != null, '26b: a winner is selected');
const selected = selectBestScoredCandidate(evaluated.candidates);
assert(selected?.index === evaluated.winner?.index, '26c: logged winner matches existing selection logic');
assert(
  evaluated.winner!.score === Math.max(...evaluated.candidates.filter((row) => row.valid).map((row) => row.score)),
  '26d: first-generation winner is the highest fashion score',
);

const grouped = groupByCategory(spread);
assert(grouped.shoes.length > 0, '19b: include-shoes shortlist still retrieves shoes');

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
