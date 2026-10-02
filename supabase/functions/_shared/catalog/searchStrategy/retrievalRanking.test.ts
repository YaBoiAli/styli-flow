/**
 * Retrieval ranking: style/occasion intent vs query-title overlap.
 * Offline only. Does not call Channel3.
 *
 * Run: npm run test:search-strategy
 */
import type { NormalizedProduct } from '../types.ts';
import { CATALOG_RELEVANCE_WEIGHTS, PRODUCT_SIGNAL_WEIGHTS, scoreCatalogRelevance } from './score.ts';
import type { SearchIntent } from './types.ts';

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

function product(partial: Partial<NormalizedProduct> & Pick<NormalizedProduct, 'product_name'>): NormalizedProduct {
  return {
    brand: 'Acme',
    description: 'cotton apparel',
    price: 68,
    currency: 'USD',
    image_url: 'https://cdn.example.com/a.jpg',
    product_url: 'https://shop.example.com/p/1',
    category: 'top',
    subcategory: 'top',
    colors: ['black'],
    sizes: ['M'],
    material: 'cotton',
    gender: 'men',
    availability: 'in_stock',
    source: 'external_search',
    source_product_id: `channel3:${partial.product_name.replace(/\s+/g, '-').toLowerCase()}`,
    last_checked: '2026-09-25T12:00:00.000Z',
    ...partial,
  };
}

type Ranked = {
  name: string;
  score: number;
  style: number;
  occasion: number;
  category: number;
  query: number;
  product_relevance: number;
};

function rank(intent: SearchIntent, matchedQuery: string, items: NormalizedProduct[]): Ranked[] {
  return items
    .map((item) => {
      const scored = scoreCatalogRelevance(item, intent, matchedQuery);
      return {
        name: item.product_name,
        score: scored.score,
        style: scored.breakdown.style,
        occasion: scored.breakdown.occasion,
        category: scored.breakdown.category,
        query: scored.breakdown.query_relevance,
        product_relevance: scored.breakdown.product_relevance,
      };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
}

function dump(label: string, rows: Ranked[]): string {
  return [
    label,
    ...rows.map(
      (row) =>
        `  ${row.score}  style=${row.style} occ=${row.occasion} cat=${row.category} query=${row.query} prod=${row.product_relevance}  ${row.name}`,
    ),
  ].join('\n');
}

function byName(rows: Ranked[], name: string): Ranked {
  const row = rows.find((item) => item.name === name);
  if (!row) throw new Error(`missing fixture ${name}`);
  return row;
}

function assertAhead(rows: Ranked[], winner: string, loser: string, message: string): void {
  const win = rows.findIndex((row) => row.name === winner);
  const lose = rows.findIndex((row) => row.name === loser);
  const ok = win >= 0 && lose >= 0 && win < lose;
  if (!ok) console.error(dump(message, rows));
  assert(ok, message);
}

assert(
  CATALOG_RELEVANCE_WEIGHTS.query_relevance < CATALOG_RELEVANCE_WEIGHTS.product_relevance,
  'query-title weight stays below combined style/category/occasion evidence',
);
assert(
  CATALOG_RELEVANCE_WEIGHTS.query_relevance > 0,
  'query-title relevance is not zeroed',
);
assert(
  PRODUCT_SIGNAL_WEIGHTS.category >= PRODUCT_SIGNAL_WEIGHTS.occasion,
  'category remains at least as strong as occasion inside product_relevance',
);

const y2kParty: SearchIntent = { style: 'Y2K', occasion: 'Party', category: 'top', gender: 'men' };
const y2kMetallic = product({
  product_name: 'Rhinestone Metallic Baby Tee',
  subcategory: 'crop',
  description: 'y2k rhinestone metallic crop',
});
const y2kPartyBoth = product({
  product_name: 'Metallic Statement Party Top',
  subcategory: 'crop',
  description: 'y2k rhinestone sequin statement',
});
const partyShirtGeneric = product({
  product_name: 'Everyday Party Shirt',
  subcategory: 'shirt',
  description: 'plain cotton button shirt',
});
const genericTee = product({
  product_name: 'Cotton Crew Top',
  subcategory: 'top',
  description: 'plain cotton crew',
});
const partyShirtAsShoes = product({
  product_name: 'Party Shirt Sneakers',
  category: 'shoes',
  subcategory: 'sneakers',
  description: 'everyday party shirt sneakers',
});

const y2kRows = rank(y2kParty, 'party shirt men', [
  y2kMetallic,
  y2kPartyBoth,
  partyShirtGeneric,
  genericTee,
  partyShirtAsShoes,
]);
const y2kStyle = byName(y2kRows, 'Rhinestone Metallic Baby Tee');
const y2kGeneric = byName(y2kRows, 'Everyday Party Shirt');
assert(y2kGeneric.query > y2kStyle.query, 'Y2K+Party: generic party shirt still has stronger query-title overlap');
assert(y2kStyle.style > y2kGeneric.style, 'Y2K+Party: rhinestone tee has stronger style evidence');
assert(y2kStyle.score > y2kGeneric.score, 'Y2K+Party: style match has a strictly higher retrieval score');
assertAhead(
  y2kRows,
  'Rhinestone Metallic Baby Tee',
  'Everyday Party Shirt',
  'Y2K+Party: strong style outranks generic party-title shirt',
);
assertAhead(
  y2kRows,
  'Metallic Statement Party Top',
  'Rhinestone Metallic Baby Tee',
  'Y2K+Party: style+occasion beats style-only',
);
assertAhead(
  y2kRows,
  'Cotton Crew Top',
  'Party Shirt Sneakers',
  'Y2K+Party: correct-category weak style beats wrong-category title match',
);
assert(byName(y2kRows, 'Party Shirt Sneakers').category === 0, 'Y2K+Party: shoes keep category 0 against a top intent');

const streetWork: SearchIntent = { style: 'Streetwear', occasion: 'Work', category: 'top', gender: 'men' };
const streetHoodie = product({
  product_name: 'Streetwear Oversized Graphic Hoodie',
  subcategory: 'hoodie',
  description: 'baggy logo hoodie',
});
const workShirtGeneric = product({
  product_name: 'Classic Work Shirt',
  subcategory: 'shirt',
  description: 'plain cotton work shirt',
});
const streetWorkBoth = product({
  product_name: 'Streetwear Graphic Work Shirt',
  subcategory: 'shirt',
  description: 'oversized graphic button shirt',
});
const streetRows = rank(streetWork, 'work shirt men', [
  streetHoodie,
  workShirtGeneric,
  streetWorkBoth,
  genericTee,
]);
const streetStyle = byName(streetRows, 'Streetwear Oversized Graphic Hoodie');
const streetGeneric = byName(streetRows, 'Classic Work Shirt');
assert(streetGeneric.query > streetStyle.query, 'Streetwear+Work: work shirt still has stronger query-title overlap');
assert(streetStyle.style > streetGeneric.style, 'Streetwear+Work: hoodie has stronger style evidence');
assert(streetStyle.score > streetGeneric.score, 'Streetwear+Work: style match has a strictly higher retrieval score');
assertAhead(
  streetRows,
  'Streetwear Oversized Graphic Hoodie',
  'Classic Work Shirt',
  'Streetwear+Work: on-vibe hoodie outranks generic work-title shirt',
);
assertAhead(
  streetRows,
  'Streetwear Graphic Work Shirt',
  'Classic Work Shirt',
  'Streetwear+Work: style+work shirt beats generic work shirt',
);

const quietEveryday: SearchIntent = { style: 'Quiet Luxury', occasion: 'Everyday', category: 'top', gender: 'men' };
const cashmere = product({
  product_name: 'Camel Cashmere Crew Sweater',
  subcategory: 'sweater',
  material: 'cashmere',
  description: 'merino cashmere knit',
});
const everydayTee = product({
  product_name: 'Everyday Cotton Tee',
  subcategory: 't-shirt',
  description: 'plain cotton crew tee',
});
const quietRows = rank(quietEveryday, 'everyday tee men', [cashmere, everydayTee, genericTee]);
const quietStyle = byName(quietRows, 'Camel Cashmere Crew Sweater');
const quietGeneric = byName(quietRows, 'Everyday Cotton Tee');
assert(quietGeneric.query > quietStyle.query, 'Quiet Luxury+Everyday: everyday tee still has stronger query-title overlap');
assert(quietStyle.style > quietGeneric.style, 'Quiet Luxury+Everyday: cashmere has stronger style evidence');
assert(quietStyle.score > quietGeneric.score, 'Quiet Luxury+Everyday: style match has a strictly higher retrieval score');
assertAhead(
  quietRows,
  'Camel Cashmere Crew Sweater',
  'Everyday Cotton Tee',
  'Quiet Luxury+Everyday: cashmere outranks generic everyday-title tee',
);

const darkSchool: SearchIntent = { style: 'Dark Academia', occasion: 'School', category: 'top', gender: 'men' };
const turtleneck = product({
  product_name: 'Brown Tweed Turtleneck Sweater',
  subcategory: 'sweater',
  material: 'wool',
  description: 'tweed wool turtleneck cardigan',
});
const schoolHoodie = product({
  product_name: 'School Hoodie',
  subcategory: 'hoodie',
  description: 'cotton crew sweatshirt',
});
const darkRows = rank(darkSchool, 'school hoodie men', [turtleneck, schoolHoodie, genericTee]);
const darkStyle = byName(darkRows, 'Brown Tweed Turtleneck Sweater');
const darkGeneric = byName(darkRows, 'School Hoodie');
assert(darkGeneric.query > darkStyle.query, 'Dark Academia+School: school hoodie still has stronger query-title overlap');
assert(darkStyle.style > darkGeneric.style, 'Dark Academia+School: turtleneck has stronger style evidence');
assert(darkStyle.score > darkGeneric.score, 'Dark Academia+School: style match has a strictly higher retrieval score');
assertAhead(
  darkRows,
  'Brown Tweed Turtleneck Sweater',
  'School Hoodie',
  'Dark Academia+School: turtleneck outranks generic school-title hoodie',
);

const elevatedEveryday: SearchIntent = { style: 'Elevated Streetwear', occasion: 'Everyday', category: 'top', gender: 'men' };
const overshirt = product({
  product_name: 'Premium Heavyweight Overshirt',
  subcategory: 'overshirt',
  description: 'relaxed suede leather bomber knit',
});
const elevatedRows = rank(elevatedEveryday, 'everyday tee men', [overshirt, everydayTee, genericTee]);
const elevatedStyle = byName(elevatedRows, 'Premium Heavyweight Overshirt');
const elevatedGeneric = byName(elevatedRows, 'Everyday Cotton Tee');
assert(elevatedGeneric.query > elevatedStyle.query, 'Elevated Streetwear+Everyday: everyday tee still has stronger query-title overlap');
assert(elevatedStyle.style > elevatedGeneric.style, 'Elevated Streetwear+Everyday: overshirt has stronger style evidence');
assert(elevatedStyle.score > elevatedGeneric.score, 'Elevated Streetwear+Everyday: style match has a strictly higher retrieval score');
assertAhead(
  elevatedRows,
  'Premium Heavyweight Overshirt',
  'Everyday Cotton Tee',
  'Elevated Streetwear+Everyday: overshirt outranks generic everyday-title tee',
);

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
console.log(dump('Y2K+Party', y2kRows));
console.log(dump('Streetwear+Work', streetRows));
console.log(dump('Quiet Luxury+Everyday', quietRows));
console.log(dump('Dark Academia+School', darkRows));
console.log(dump('Elevated Streetwear+Everyday', elevatedRows));
