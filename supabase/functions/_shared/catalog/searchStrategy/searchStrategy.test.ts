/**
 * Styli catalog search strategy. Mocked Channel3 only.
 * Run: npm run test:search-strategy
 */
import type { Channel3Product } from '../channel3/types.ts';
import { generateSearchQueries } from './queries.ts';
import { hardFilterReason, runSearchStrategy } from './run.ts';
import { scoreCatalogRelevance } from './score.ts';
import type { StrategyFetchedItem, StrategySearchBackend } from './types.ts';
import { categoryPriceCeiling } from './budget.ts';
import { normalizeChannel3Product } from '../channel3/normalize.ts';

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

const now = '2026-09-25T12:00:00.000Z';

function raw(partial: Partial<Channel3Product> & Pick<Channel3Product, 'id' | 'title'>): Channel3Product {
  return {
    images: [{ url: 'https://cdn.example.com/a.jpg', is_main_image: true }],
    offers: [
      {
        url: 'https://shop.example.com/p/1',
        domain: 'shop.example.com',
        price: { price: 42, currency: 'USD' },
        availability: 'InStock',
      },
    ],
    category: { slug: 't-shirts', title: 'T-Shirts', path: [], has_children: false },
    brands: [{ id: 'b1', name: 'Acme' }],
    gender: 'male',
    ...partial,
  };
}

function backend(options: {
  brands?: Record<string, { id: string; name: string } | null>;
  productsForQuery?: (query: string, brandId?: string) => Channel3Product[];
}): StrategySearchBackend {
  return {
    async resolveBrand(name) {
      if (!options.brands) return { id: `id-${name}`, name };
      if (name in options.brands) return options.brands[name];
      return { id: `id-${name}`, name };
    },
    async search(input) {
      const raws = options.productsForQuery?.(input.query, input.brandId) ?? [
        raw({ id: `${input.query}-1`, title: `${input.query} Graphic Tee` }),
      ];
      return raws.map((item): StrategyFetchedItem => {
        const result = normalizeChannel3Product(item, { now, fallbackBrand: input.brandName });
        return result.ok
          ? { ok: true, product: result.product }
          : { ok: false, reason: result.reason };
      });
    },
  };
}

const y2kTop = generateSearchQueries({ style: 'Y2K', category: 'top', gender: 'men' });
assert(y2kTop.some((query) => /graphic tee/i.test(query.text)), '1: Y2K top has graphic tee');
assert(y2kTop.every((query) => !/baby tee/i.test(query.text)), '1b: men Y2K skips baby tee');
assert(y2kTop.every((query) => query.text.includes('men')), '1c: men suffix applied');
assert(!y2kTop.some((query) => /hoodies tanks sweaters/i.test(query.text)), '1d: no giant category dump');

const streetTop = generateSearchQueries({ style: 'Streetwear', category: 'top' });
assert(streetTop.some((query) => /oversized hoodie/i.test(query.text)), '2: streetwear hoodie query');
assert(streetTop.some((query) => /graphic tee/i.test(query.text)), '2b: streetwear tee query');

const nightTop = generateSearchQueries({ style: 'Night Out', category: 'top', gender: 'men' });
assert(nightTop.some((query) => /going out shirt/i.test(query.text)), '3: night out uses concrete shirt language');
assert(!nightTop.some((query) => query.text.toLowerCase() === 'night out'), '3b: does not search raw Night Out');

const streetShoes = generateSearchQueries({ style: 'Streetwear', category: 'shoes' });
assert(streetShoes.every((query) => /sneaker|boot|shoe/i.test(query.text)), '4: streetwear shoes stay on footwear');

const y2kShoes = generateSearchQueries({ style: 'Y2K', category: 'shoes' });
assert(y2kShoes.some((query) => /Y2K/i.test(query.text) && /sneaker|platform/i.test(query.text)), '5: Y2K shoes');
const y2kMenShoes = generateSearchQueries({ style: 'Y2K', category: 'shoes', gender: 'men' });
assert(y2kMenShoes.every((query) => !/heel/i.test(query.text)), '5b: men Y2K shoes skip heels');

const streetBottom = generateSearchQueries({ style: 'Streetwear', category: 'bottom' });
assert(streetBottom.some((query) => /baggy jeans|cargo pants|joggers/i.test(query.text)), '6: streetwear bottoms');

const branded = generateSearchQueries({ style: 'Y2K', category: 'top', brands: ['H&M', 'Zara'] }, 8);
assert(branded.some((query) => query.brand === 'H&M'), '7: H&M searches are separate');
assert(branded.some((query) => query.brand === 'Zara'), '7b: Zara searches are separate');
assert(!branded.some((query) => query.brand === 'H&M, Zara'), '7c: brands are not combined');

const nikeAdidas = generateSearchQueries({ style: 'Streetwear', category: 'top', brands: ['Nike', 'Adidas'] }, 8);
assert(nikeAdidas.filter((query) => query.brand === 'Nike').length >= 1, '8: Nike-specific queries');
assert(nikeAdidas.filter((query) => query.brand === 'Adidas').length >= 1, '8b: Adidas-specific queries');

const noBrand = generateSearchQueries({ style: 'Streetwear', category: 'top' });
assert(noBrand.every((query) => !query.brand), '9: no brand preference stays brandless');

assert(categoryPriceCeiling({ category: 'top', budget: 150 }) === 150, '12: outfit budget is item ceiling, not 1/3');
assert(categoryPriceCeiling({ category: 'shoes', budget: 150, shoeBudget: 80 }) === 80, '12b: shoe budget cap');

const overBudget = normalizeChannel3Product(
  raw({
    id: 'pricey',
    title: 'Cashmere Tee',
    offers: [{ url: 'https://shop.example.com/p', domain: 'shop.example.com', price: { price: 700, currency: 'USD' }, availability: 'InStock' }],
  }),
  { now },
);
assert(overBudget.ok, '12c: expensive product still normalizes');
assert(
  overBudget.ok && hardFilterReason(overBudget.product, { category: 'top', budget: 150 }) === 'over_budget',
  '12d: $700 filtered against $150 outfit budget',
);

const menTee = normalizeChannel3Product(raw({ id: 'm1', title: 'Graphic Tee', gender: 'male' }), { now });
assert(menTee.ok && hardFilterReason(menTee.product, { gender: 'women' }) === 'wrong_gender', '13: men product dropped for women intent');

const noImage = normalizeChannel3Product(raw({ id: 'img', title: 'Graphic Tee', images: [] }), { now });
assert(!noImage.ok && noImage.reason === 'no_image', '14: missing image skipped by existing normalize');

const sofa = normalizeChannel3Product(
  raw({ id: 'sofa', title: 'Cloud Sofa', category: { slug: 'sofas', title: 'Sofas', path: [], has_children: false } }),
  { now },
);
assert(!sofa.ok && sofa.reason === 'unmapped_category', '15: invalid category skipped');

const limited = generateSearchQueries({ style: 'Y2K', category: 'top', brands: ['H&M', 'Zara'] }, 4);
assert(limited.length <= 4, '16: maxQueries is respected');
assert(limited.every((query) => query.brand === 'H&M' || query.brand === 'Zara'), '16b: capped queries stay brand-specific');

async function main() {
  const unresolved = await runSearchStrategy(
    { style: 'Y2K', category: 'top', brands: ['H&M', 'NoSuchBrand'] },
    backend({
      brands: {
        'H&M': { id: 'hm', name: 'H&M' },
        NoSuchBrand: null,
      },
      productsForQuery: (_query, brandId) =>
        brandId === 'hm' ? [raw({ id: 'hm-tee', title: 'Y2K Graphic Tee', brands: [{ id: 'hm', name: 'H&M' }] })] : [],
    }),
    { maxQueries: 4, perQueryLimit: 4, finalCandidates: 8 },
  );
  assert(unresolved.unresolvedBrands.includes('NoSuchBrand'), '10: unresolved brand is skipped');
  assert(unresolved.candidates.length >= 1, '10b: other brands still search');

  const duped = await runSearchStrategy(
    { style: 'Streetwear', category: 'top' },
    backend({
      productsForQuery: () => [raw({ id: 'same-1', title: 'Streetwear Graphic Tee' })],
    }),
    { maxQueries: 4, perQueryLimit: 4, finalCandidates: 8 },
  );
  assert(duped.duplicatesRemoved >= 1, '11: duplicate Channel3 ids collapse');
  assert(duped.candidates.filter((candidate) => candidate.product.source_product_id === 'channel3:same-1').length === 1, '11b: one surviving row');

  const scored = scoreCatalogRelevance(duped.candidates[0].product, { style: 'Streetwear', category: 'top' }, 'streetwear graphic tee');
  assert(scored.score >= 0 && scored.score <= 100, 'score is 0-100');
  assert(typeof scored.breakdown.style === 'number', 'score breakdown is explainable');
  assert(typeof scored.breakdown.query_relevance === 'number', 'score includes query_relevance');

  const budgeted = await runSearchStrategy(
    { style: 'Y2K', category: 'top', budget: 150 },
    backend({
      productsForQuery: () => [
        raw({
          id: 'cheap',
          title: 'Y2K Graphic Tee',
          offers: [{ url: 'https://shop.example.com/p', domain: 'shop.example.com', price: { price: 28, currency: 'USD' }, availability: 'InStock' }],
        }),
        raw({
          id: 'luxury',
          title: 'Y2K Graphic Tee',
          offers: [{ url: 'https://shop.example.com/p', domain: 'shop.example.com', price: { price: 700, currency: 'USD' }, availability: 'InStock' }],
        }),
      ],
    }),
    { maxQueries: 2, perQueryLimit: 4, finalCandidates: 8 },
  );
  assert(
    budgeted.candidates.every((candidate) => candidate.product.price <= 150),
    '12e: strategy keeps only in-budget candidates',
  );

  const mismatched = await runSearchStrategy(
    { style: 'Y2K', category: 'top' },
    backend({
      productsForQuery: () => [
        raw({
          id: 'shoe',
          title: 'Y2K Skate Sneakers',
          category: { slug: 'sneakers', title: 'Sneakers', path: [], has_children: false },
        }),
      ],
    }),
    { maxQueries: 1, perQueryLimit: 2, finalCandidates: 8 },
  );
  assert(mismatched.candidates.every((candidate) => candidate.product.category === 'top'), '15b: non-top products do not rank for top intent');
  assert((mismatched.filterReasons.wrong_category ?? 0) >= 1, '15c: wrong_category is hard-filtered');

  const gendered = await runSearchStrategy(
    { style: 'Y2K', category: 'top', gender: 'women' },
    backend({
      productsForQuery: () => [raw({ id: 'mens-tee', title: 'Y2K Graphic Tee', gender: 'male' })],
    }),
    { maxQueries: 1, perQueryLimit: 2, finalCandidates: 8 },
  );
  assert((gendered.filterReasons.wrong_gender ?? 0) >= 1, '13b: strategy drops reliable opposite-gender products');

  if (failed) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\n${passed} passed`);
}

void main();
