/**
 * Retrieval-quality pass. Mocked products only.
 * Run: npm run test:search-strategy
 */
import type { NormalizedProduct } from '../types.ts';
import { budgetFitScore, categoryPriceCeiling } from './budget.ts';
import { generateSearchQueries } from './queries.ts';
import { scoreQueryRelevance, parseQueryIntent } from './queryIntent.ts';
import { hardFilterReason } from './run.ts';
import { isMarketplaceRetailer, scoreCatalogRelevance, sourceQualityScore } from './score.ts';

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

function product(partial: Partial<NormalizedProduct> & Pick<NormalizedProduct, 'product_name'>): NormalizedProduct {
  return {
    brand: 'Acme',
    description: null,
    price: 48,
    currency: 'USD',
    image_url: 'https://cdn.example.com/a.jpg',
    product_url: 'https://shop.example.com/p/1',
    category: 'top',
    subcategory: 't-shirt',
    colors: ['black'],
    sizes: ['M'],
    material: 'cotton',
    gender: null,
    availability: 'in_stock',
    source: 'external_search',
    source_product_id: `channel3:${partial.product_name.replace(/\s+/g, '-').toLowerCase()}`,
    last_checked: '2026-09-25T12:00:00.000Z',
    ...partial,
  };
}

const luxuryHoodie = product({
  product_name: 'Chrome Hearts Oversized Hoodie',
  category: 'top',
  subcategory: 'hoodie',
  price: 2519,
});
const reasonableHoodie = product({
  product_name: 'Streetwear Oversized Hoodie',
  category: 'top',
  subcategory: 'hoodie',
  price: 68,
});
const luxuryShoes = product({
  product_name: 'Y2K Platform Sneakers',
  category: 'shoes',
  subcategory: 'sneakers',
  price: 1270,
});

assert(categoryPriceCeiling({ category: 'top', budget: 150 }) === 150, 'budget: item ceiling is outfit budget');
assert(hardFilterReason(luxuryHoodie, { style: 'Streetwear', category: 'top', budget: 150 }) === 'over_budget', 'budget: low budget excludes extreme luxury');
assert(hardFilterReason(reasonableHoodie, { style: 'Streetwear', category: 'top', budget: 150 }) === null, 'budget: reasonable item survives');
assert(hardFilterReason(luxuryHoodie, { style: 'Streetwear', category: 'top' }) === null, 'budget: no budget does not hard-filter');
assert(hardFilterReason(luxuryShoes, { style: 'Y2K', category: 'shoes', budget: 150, shoeBudget: 120 }) === 'over_budget', 'budget: shoe cap excludes luxury shoes');
assert(budgetFitScore(luxuryHoodie, { style: 'Streetwear' }) < budgetFitScore(reasonableHoodie, { style: 'Streetwear' }), 'budget: no-budget ranks luxury below reasonable');
assert(budgetFitScore({ price: Number.NaN, category: 'top' }, { budget: 150 }) === 55, 'budget: missing price does not crash');
assert(hardFilterReason(product({ product_name: 'Euro Tee', currency: 'EUR' }), { category: 'top', budget: 150 }) === 'unsupported_currency', 'budget: non-USD still rejected');

const womenHeels = product({
  product_name: 'Y2K Platform Heels',
  category: 'shoes',
  subcategory: 'heels',
  gender: 'women',
  price: 64,
});
const menSneakers = product({
  product_name: 'Y2K Skate Sneakers',
  category: 'shoes',
  subcategory: 'sneakers',
  gender: 'men',
  price: 80,
});
const unisexSneakers = product({
  product_name: 'Y2K Platform Sneakers',
  category: 'shoes',
  subcategory: 'sneakers',
  gender: null,
  price: 70,
});

const menShoeQueries = generateSearchQueries({ style: 'Y2K', category: 'shoes', gender: 'men' });
assert(menShoeQueries.every((query) => !/heel/i.test(query.text)), 'gender: men Y2K shoes do not query heels');
assert(menShoeQueries.every((query) => /\bmen\b/i.test(query.text)), 'gender: men suffix on shoe queries');
assert(hardFilterReason(womenHeels, { style: 'Y2K', category: 'shoes', gender: 'men' }) === 'wrong_gender', 'gender: men reject explicit women heels');
assert(hardFilterReason(womenHeels, { style: 'Y2K', category: 'shoes', gender: 'women' }) === null, 'gender: women can accept women footwear');
assert(hardFilterReason(womenHeels, { style: 'Y2K', category: 'shoes' }) === null, 'gender: unspecified does not over-filter women heels');
assert(hardFilterReason(unisexSneakers, { style: 'Y2K', category: 'shoes', gender: 'men' }) === null, 'gender: missing product gender is not rejected');
assert(hardFilterReason(menSneakers, { style: 'Y2K', category: 'shoes', gender: 'women' }) === 'wrong_gender', 'gender: women reject explicit men sneakers');

const womenShoeQueries = generateSearchQueries({ style: 'Y2K', category: 'shoes', gender: 'women' });
assert(womenShoeQueries.some((query) => /heel|platform/i.test(query.text)), 'gender: women Y2K shoes may use women footwear terms');

const nightIntent = { style: 'Night Out', category: 'top' as const, gender: 'men' as const };
const goingOut = product({
  product_name: 'Satin Fitted Going Out Shirt',
  subcategory: 'shirt',
  description: 'sleek nightlife dress shirt',
  gender: 'men',
});
const pajama = product({
  product_name: 'Cotton Pajama Lounge Shirt',
  subcategory: 'shirt',
  description: 'sleepwear nightwear',
  gender: 'men',
});
const western = product({
  product_name: 'Western Pearl Snap Shirt',
  subcategory: 'shirt',
  description: 'cowboy workwear shirt',
  gender: 'men',
});
const outdoor = product({
  product_name: 'Trail Outdoor Hiking Shirt',
  subcategory: 'shirt',
  description: 'thermal outdoor shirt',
  gender: 'men',
});
const statement = product({
  product_name: 'Cuban Collar Party Shirt',
  subcategory: 'shirt',
  description: 'elevated casual dinner shirt',
  gender: 'men',
});

assert(hardFilterReason(pajama, nightIntent) === 'night_out_exclude', 'night out: pajama shirt is excluded');
assert(hardFilterReason(goingOut, nightIntent) === null, 'night out: legitimate going-out shirt survives');
assert(hardFilterReason(statement, nightIntent) === null, 'night out: statement shirt survives');
assert(hardFilterReason(western, nightIntent) === null, 'night out: western is not hard-dropped');

const nightQuery = 'fitted going out shirt men';
const goingScore = scoreCatalogRelevance(goingOut, nightIntent, nightQuery);
const westernScore = scoreCatalogRelevance(western, nightIntent, nightQuery);
const outdoorScore = scoreCatalogRelevance(outdoor, nightIntent, nightQuery);
const statementScore = scoreCatalogRelevance(statement, nightIntent, nightQuery);
assert(goingScore.score > westernScore.score, 'night out: going-out outranks western');
assert(statementScore.score > outdoorScore.score, 'night out: statement outranks outdoor');
assert(goingScore.breakdown.query_relevance > westernScore.breakdown.query_relevance, 'night out: query relevance prefers nightlife language');

const nightQueries = generateSearchQueries(nightIntent);
assert(nightQueries.some((query) => /going out|camp collar|knit polo|satin|nightlife|dinner/i.test(query.text)), 'night out: targeted nightlife queries');
assert(!nightQueries.some((query) => query.text.toLowerCase() === 'night out shirt men'), 'night out: avoids raw night-out shirt query');

const y2kProduct = product({
  product_name: 'Vintage 2000s Oversized Graphic T-Shirt',
  category: 'top',
  subcategory: 't-shirt',
});
const y2kQuery = scoreQueryRelevance(y2kProduct, parseQueryIntent('Y2K oversized tee'), { style: 'Y2K', category: 'top' });
assert(y2kQuery >= 80, `query: Y2K + 2000s oversized tee is strong (${y2kQuery})`);
const y2kScored = scoreCatalogRelevance(y2kProduct, { style: 'Y2K', category: 'top' }, 'Y2K oversized tee');
assert(y2kScored.breakdown.query_relevance >= 80, 'query: catalog score uses query evidence');
assert(y2kScored.score >= 70, `query: missing Y2K metadata is not a penalty (${y2kScored.score})`);

const baggy = product({
  product_name: 'Loose Fit Carpenter Denim',
  category: 'bottom',
  subcategory: 'jeans',
});
const baggyQuery = scoreQueryRelevance(baggy, parseQueryIntent('streetwear baggy jeans'), {
  style: 'Streetwear',
  category: 'bottom',
});
assert(baggyQuery >= 70, `query: streetwear baggy/denim synonyms match (${baggyQuery})`);
assert(scoreCatalogRelevance(baggy, { style: 'Streetwear', category: 'bottom' }, 'streetwear baggy jeans').breakdown.category === 100, 'query: category matching');

const walmart = product({ product_name: 'Graphic Tee', brand: 'Walmart' });
const zara = product({ product_name: 'Graphic Tee', brand: 'Zara' });
const nike = product({ product_name: 'Graphic Tee', brand: 'Nike' });
const amazon = product({ product_name: 'Graphic Tee', brand: 'Amazon' });
assert(isMarketplaceRetailer('Walmart') && isMarketplaceRetailer('Amazon'), 'marketplace: known generic retailers');
assert(!isMarketplaceRetailer('Zara') && !isMarketplaceRetailer('Nike'), 'marketplace: fashion brands are not marketplaces');
assert(
  sourceQualityScore(zara, { style: 'Y2K' }) > sourceQualityScore(walmart, { style: 'Y2K' }),
  'marketplace: fashion retailer outranks marketplace for style intent',
);
assert(sourceQualityScore(amazon, { style: 'Y2K', brands: ['Amazon'] }) === 100, 'marketplace: explicit Amazon preference is not penalized');
assert(sourceQualityScore(nike, { style: 'Streetwear', brands: ['Nike'] }) === 100, 'marketplace: selected Nike is not penalized');
const noStyleWalmart = sourceQualityScore(walmart, {});
const styleWalmart = sourceQualityScore(walmart, { style: 'Y2K' });
assert(styleWalmart < noStyleWalmart, 'marketplace: penalty applies when fashion intent exists');

const walmartRank = scoreCatalogRelevance(walmart, { style: 'Y2K', category: 'top' }, 'Y2K graphic tee');
const zaraRank = scoreCatalogRelevance(zara, { style: 'Y2K', category: 'top' }, 'Y2K graphic tee');
assert(zaraRank.score > walmartRank.score, 'marketplace: similar tees, Zara outranks Walmart');

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
