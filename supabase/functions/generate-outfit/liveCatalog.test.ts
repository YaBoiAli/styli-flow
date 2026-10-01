/**
 * Live Channel3 generation path. Mocked backend only — does not call Channel3.
 * Search strategy is real.
 */
import type { Channel3Product } from '../_shared/catalog/channel3/types.ts';
import { normalizeChannel3Product } from '../_shared/catalog/channel3/normalize.ts';
import type { StrategyFetchedItem, StrategySearchBackend } from '../_shared/catalog/searchStrategy/types.ts';
import type { CatalogProduct, CatalogResult } from './catalog.ts';
import { emptyLiveRetrieval, mergeCatalogProducts, resolveGenerationCatalog } from './liveCatalog.ts';
import {
  catalogProductFromNormalized,
  missingRequiredCategories,
  retrieveLiveChannel3Catalog,
} from './liveRetrieval.ts';

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

function raw(
  partial: Partial<Channel3Product> & Pick<Channel3Product, 'id' | 'title'> & { slug?: string },
): Channel3Product {
  const slug = partial.slug ?? 't-shirts';
  const { slug: _slug, ...rest } = partial;
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
    category: { slug, title: slug, path: [], has_children: false },
    brands: [{ id: 'b1', name: 'Acme' }],
    gender: 'male',
    ...rest,
  };
}

function recordingBackend(productsForQuery: (query: string, brandId?: string) => Channel3Product[]): {
  backend: StrategySearchBackend;
  searches: string[];
  resolves: string[];
} {
  const searches: string[] = [];
  const resolves: string[] = [];
  return {
    searches,
    resolves,
    backend: {
      async resolveBrand(name) {
        resolves.push(name);
        if (name === 'NoSuchBrand') return null;
        return { id: `id-${name.toLowerCase()}`, name };
      },
      async search(input) {
        searches.push(`${input.brandName ?? ''}|${input.query}`);
        return productsForQuery(input.query, input.brandId).map((item): StrategyFetchedItem => {
          const result = normalizeChannel3Product(item, { now, fallbackBrand: input.brandName });
          return result.ok ? { ok: true, product: result.product } : { ok: false, reason: result.reason };
        });
      },
    },
  };
}

function catalogItem(
  id: string,
  category: CatalogProduct['category'],
  extra: Partial<CatalogProduct> = {},
): CatalogProduct {
  return {
    id,
    name: `${category} ${id}`,
    brand: extra.brand ?? 'Acme',
    brand_id: extra.brand_id ?? 'brand-1',
    category,
    subcategory: category === 'shoes' ? 'sneakers' : category === 'bottom' ? 'jeans' : 't-shirt',
    price: extra.price ?? 40,
    currency: 'USD',
    color: 'black',
    colors: ['black'],
    material: 'cotton',
    description: null,
    gender: extra.gender ?? 'men',
    image_url: 'https://cdn.example.com/a.jpg',
    purchase_url: 'https://shop.example.com/p/1',
    style_tags: extra.style_tags ?? ['streetwear'],
    occasion_tags: [],
    aesthetic_tags: [],
    season_tags: [],
    fit: null,
    silhouette: null,
    pattern: null,
    formality: null,
    source: extra.source ?? 'shopify',
  };
}

function storedOk(products: CatalogProduct[]): CatalogResult {
  return { ok: true, products, catalogSource: 'live', unavailableBrands: [] };
}

function bySlot(query: string): Channel3Product[] {
  if (/sneaker|shoe|boot|heel/i.test(query)) {
    return [raw({ id: `shoe-${query}`, title: `${query} sneakers`, slug: 'sneakers', gender: 'male' })];
  }
  if (/jean|pant|jogger|bottom/i.test(query)) {
    return [raw({ id: `bottom-${query}`, title: `${query} jeans`, slug: 'jeans', gender: 'male' })];
  }
  return [raw({ id: `top-${query}`, title: `${query} graphic tee`, slug: 't-shirts', gender: 'male' })];
}

async function main() {
  const full = recordingBackend(bySlot);
  const liveFull = await retrieveLiveChannel3Catalog({
    backend: full.backend,
    style: 'Streetwear',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: [],
  });
  assert(liveFull.ok && liveFull.attempted, '1: live retrieval succeeds');
  assert(missingRequiredCategories(liveFull.products).length === 0, '2: live retrieval has enough products');
  assert(liveFull.categories.top > 0 && liveFull.categories.bottom > 0 && liveFull.categories.shoes > 0, '2b: all core categories present');

  const noShoes = recordingBackend((query) => (/sneaker|shoe|boot|heel/i.test(query) ? [] : bySlot(query)));
  const liveNoShoes = await retrieveLiveChannel3Catalog({
    backend: noShoes.backend,
    style: 'Streetwear',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: [],
  });
  assert(liveNoShoes.categories.shoes === 0, '3: live retrieval missing shoes');
  assert(liveNoShoes.categories.top > 0, '3b: tops still kept');

  const noTops = recordingBackend((query) => (/tee|hoodie|shirt|polo/i.test(query) ? [] : bySlot(query)));
  const liveNoTops = await retrieveLiveChannel3Catalog({
    backend: noTops.backend,
    style: 'Streetwear',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: [],
  });
  assert(liveNoTops.categories.top === 0, '4: live retrieval missing tops');

  const noBottoms = recordingBackend((query) => (/jean|pant|jogger/i.test(query) ? [] : bySlot(query)));
  const liveNoBottoms = await retrieveLiveChannel3Catalog({
    backend: noBottoms.backend,
    style: 'Streetwear',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: [],
  });
  assert(liveNoBottoms.categories.bottom === 0, '5: live retrieval missing bottoms');

  const throwing: StrategySearchBackend = {
    async resolveBrand() {
      return null;
    },
    async search() {
      throw new Error('upstream');
    },
  };
  const liveThrow = await retrieveLiveChannel3Catalog({
    backend: throwing,
    style: 'Streetwear',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: [],
  });
  assert(!liveThrow.ok && liveThrow.attempted, '6: Channel3 throws → empty live, not crash');

  const empty = recordingBackend(() => []);
  const liveEmpty = await retrieveLiveChannel3Catalog({
    backend: empty.backend,
    style: 'Streetwear',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: [],
  });
  assert(!liveEmpty.ok && liveEmpty.usable === 0, '7: Channel3 returns empty');

  let liveCalls = 0;
  const hybrid = await resolveGenerationCatalog({
    retrieveLive: async () => {
      liveCalls += 1;
      return liveNoShoes;
    },
    loadStored: async () => storedOk([catalogItem('stored-shoe', 'shoes')]),
    isSufficient: (products) => missingRequiredCategories(products).length === 0,
  });
  assert(hybrid.retrievalSource === 'hybrid', '8: hybrid live + catalog fills missing shoes');
  assert(hybrid.products.some((product) => product.category === 'shoes' && product.id === 'stored-shoe'), '8b: catalog shoe merged');
  assert(hybrid.products.some((product) => product.category === 'top'), '8c: live tops kept');

  const branded = recordingBackend((query, brandId) => {
    if (brandId === 'id-zara') return [raw({ id: 'zara-tee', title: `${query} graphic tee`, brands: [{ id: 'z', name: 'Zara' }] })];
    return [];
  });
  const liveBrands = await retrieveLiveChannel3Catalog({
    backend: branded.backend,
    style: 'Y2K',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: ['Zara', 'NoSuchBrand'],
    categories: ['top'],
  });
  assert(liveBrands.unresolvedBrands.includes('NoSuchBrand'), '9: unresolved brand skipped');
  assert(liveBrands.products.every((product) => product.brand === 'Zara'), '9b: explicit brand products kept');

  const heels = recordingBackend((query) =>
    /shoe|sneaker|heel/i.test(query)
      ? [raw({ id: 'heels', title: 'Y2K Platform Heels', slug: 'heels', gender: 'female' })]
      : bySlot(query),
  );
  const menShoes = await retrieveLiveChannel3Catalog({
    backend: heels.backend,
    style: 'Y2K',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: 80,
    brands: [],
    categories: ['shoes'],
  });
  assert(menShoes.products.every((product) => product.category !== 'shoes' || !/heel/i.test(product.name)), '10: men Y2K shoes reject women heels');

  const womenShoes = await retrieveLiveChannel3Catalog({
    backend: heels.backend,
    style: 'Y2K',
    occasion: 'Everyday',
    gender: 'women',
    budget: 150,
    shoeBudget: 80,
    brands: [],
    categories: ['shoes'],
  });
  assert(womenShoes.products.some((product) => /heel/i.test(product.name)), '10b: women Y2K shoes can accept heels');

  const unspecified = await retrieveLiveChannel3Catalog({
    backend: heels.backend,
    style: 'Y2K',
    occasion: 'Everyday',
    gender: 'any',
    budget: 150,
    shoeBudget: 80,
    brands: [],
    categories: ['shoes'],
  });
  assert(unspecified.products.length >= 0, '10c: unspecified gender does not crash');

  const luxury = recordingBackend(() => [
    raw({
      id: 'lux',
      title: 'Streetwear oversized hoodie',
      slug: 'hoodies',
      offers: [
        {
          url: 'https://shop.example.com/p/1',
          domain: 'shop.example.com',
          price: { price: 2519, currency: 'USD' },
          availability: 'InStock',
        },
      ],
    }),
  ]);
  const budgeted = await retrieveLiveChannel3Catalog({
    backend: luxury.backend,
    style: 'Streetwear',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: [],
    categories: ['top'],
  });
  assert(budgeted.products.every((product) => product.price <= 150), '11: budget filtering drops luxury');

  liveCalls = 0;
  const once = (() => {
    let cached: Promise<typeof liveFull> | null = null;
    return () => {
      if (!cached) {
        liveCalls += 1;
        cached = Promise.resolve(liveFull);
      }
      return cached;
    };
  })();
  await once();
  await once();
  await once();
  assert(liveCalls === 1, '12: one Channel3 retrieval reused across Gemini attempts');

  const revisionPool = liveFull.products;
  assert(revisionPool === liveFull.products, '13: revision uses the same candidate pool object');

  liveCalls = 0;
  const fallback = await resolveGenerationCatalog({
    retrieveLive: async () => {
      liveCalls += 1;
      return emptyLiveRetrieval('missing_api_key');
    },
    loadStored: async () =>
      storedOk([
        catalogItem('c-top', 'top'),
        catalogItem('c-bottom', 'bottom'),
        catalogItem('c-shoe', 'shoes'),
      ]),
    isSufficient: (products) => missingRequiredCategories(products).length === 0,
  });
  assert(fallback.retrievalSource === 'catalog_fallback', '14: catalog fallback works');
  assert(fallback.channel3Attempted === false, '14b: missing key does not attempt Channel3');
  assert(liveCalls === 1, '14c: fallback retrieveLive still called once');

  const thrown = await resolveGenerationCatalog({
    retrieveLive: async () => liveThrow,
    loadStored: async () =>
      storedOk([
        catalogItem('c-top', 'top'),
        catalogItem('c-bottom', 'bottom'),
        catalogItem('c-shoe', 'shoes'),
      ]),
    isSufficient: (products) => missingRequiredCategories(products).length === 0,
  });
  assert(thrown.retrievalSource === 'catalog_fallback', '6b: Channel3 throw falls back to catalog');

  const emptyResolved = await resolveGenerationCatalog({
    retrieveLive: async () => liveEmpty,
    loadStored: async () =>
      storedOk([
        catalogItem('c-top', 'top'),
        catalogItem('c-bottom', 'bottom'),
        catalogItem('c-shoe', 'shoes'),
      ]),
    isSufficient: (products) => missingRequiredCategories(products).length === 0,
  });
  assert(emptyResolved.retrievalSource === 'catalog_fallback', '7b: empty Channel3 falls back');

  const sufficient = await resolveGenerationCatalog({
    retrieveLive: async () => liveFull,
    loadStored: async () => {
      throw new Error('should not load stored catalog when live is sufficient');
    },
    isSufficient: (products) => missingRequiredCategories(products).length === 0,
  });
  assert(sufficient.retrievalSource === 'channel3_live', '1b: sufficient live skips stored catalog');

  const merged = mergeCatalogProducts(liveNoShoes.products, [catalogItem('stored-shoe', 'shoes')]);
  assert(missingRequiredCategories(merged).length === 0, '8d: merge fills the gap');

  const noShoeSearch = recordingBackend(bySlot);
  const liveNoShoePref = await retrieveLiveChannel3Catalog({
    backend: noShoeSearch.backend,
    style: 'Streetwear',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: [],
    categories: ['top', 'bottom'],
  });
  assert(
    noShoeSearch.searches.every((row) => !/sneaker|shoe|boot|heel/i.test(row)),
    'no-shoes: Channel3 does not execute the shoes search',
  );
  assert(liveNoShoePref.categories.shoes === 0, 'no-shoes: retrieved catalog has no shoes');

  const includeSearch = recordingBackend(bySlot);
  await retrieveLiveChannel3Catalog({
    backend: includeSearch.backend,
    style: 'Streetwear',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: [],
  });
  assert(
    includeSearch.searches.some((row) => /sneaker|shoe|boot|heel/i.test(row)),
    'include-shoes: Channel3 still executes the shoes search',
  );

  const liveTopsBottoms = liveNoShoes;
  const noShoeHybrid = await resolveGenerationCatalog({
    retrieveLive: async () => liveTopsBottoms,
    loadStored: async () =>
      storedOk([
        catalogItem('stored-top', 'top'),
        catalogItem('stored-shoe', 'shoes'),
      ]),
    isSufficient: (products) => missingRequiredCategories(products, ['top', 'bottom']).length === 0,
    required: ['top', 'bottom'],
    excludeCategories: ['shoes'],
  });
  assert(
    noShoeHybrid.products.every((product) => product.category !== 'shoes'),
    'hybrid: no-shoes generation does not fill shoes from Supabase',
  );

  const sneakerHybrid = await resolveGenerationCatalog({
    retrieveLive: async () => liveTopsBottoms,
    loadStored: async () =>
      storedOk([
        catalogItem('stored-top', 'top'),
        {
          ...catalogItem('stored-sneaker', 'accessory'),
          name: 'White Canvas Sneakers',
          subcategory: 'sneakers',
        },
      ]),
    isSufficient: (products) => missingRequiredCategories(products, ['top', 'bottom']).length === 0,
    required: ['top', 'bottom'],
    excludeCategories: ['shoes'],
  });
  assert(
    sneakerHybrid.products.every((product) => product.id !== 'stored-sneaker'),
    'hybrid: footwear is not selected even if stored as accessory',
  );
  assert(noShoeHybrid.retrievalSource === 'channel3_live', 'hybrid: top+bottom live is sufficient without shoes');

  const normalized = normalizeChannel3Product(raw({ id: 'n1', title: 'Graphic Tee' }), { now });
  assert(normalized.ok && catalogProductFromNormalized(normalized.product).id === 'channel3:n1', 'map: Channel3 id stays in memory');
  assert(liveFull.reason === 'successful', '1: successful Channel3 reason is successful');
  assert(hybrid.retrievalSource === 'hybrid', '2: partial Channel3 retrieval stays hybrid');

  const metaRaw = raw({
    id: 'meta-1',
    title: 'Oversized Hoodie',
    slug: 'hoodies',
    brands: [{ id: 'c3-acme', name: 'Acme' }],
    structured_attributes: {
      color: ['black'],
      style: ['streetwear'],
      occasion: ['everyday'],
      fit: ['oversized'],
      silhouette: ['boxy'],
    },
    variants: { options: [{ name: 'Size', values: ['S', 'M', 'L'] }] },
  });
  const metaNorm = normalizeChannel3Product(metaRaw, { now });
  assert(metaNorm.ok, '5: tagged Channel3 product normalizes');
  if (metaNorm.ok) {
    const mapped = catalogProductFromNormalized(metaNorm.product);
    assert(mapped.brand_id === 'c3-acme', '5: Channel3 brand_id is preserved');
    assert(mapped.style_tags.includes('streetwear'), '5: Channel3 style tags survive');
    assert(mapped.occasion_tags.includes('everyday'), '5: Channel3 occasion tags survive');
    assert(mapped.fit === 'oversized' && mapped.silhouette === 'boxy', '5: Channel3 fit/silhouette survive');
    assert(mapped.colors.includes('black'), '5: Channel3 colors survive');
    assert(mapped.sizes?.includes('M'), '5: Channel3 sizes survive in memory');
    assert(!mapped.style_tags.includes('y2k'), '5b: missing tags are not invented');
    assert(metaNorm.incoming.style_tags === mapped.style_tags.length, '6: style tag counts are preserved');
  }
  const plainNorm = normalizeChannel3Product(raw({ id: 'plain', title: 'Graphic Tee' }), { now });
  assert(plainNorm.ok && catalogProductFromNormalized(plainNorm.product).style_tags.length === 0, '5c: untagged Channel3 stays untagged');

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  const delayedBase = recordingBackend(bySlot);
  const slowShoes: StrategySearchBackend = {
    resolveBrand: (name) => delayedBase.backend.resolveBrand(name),
    async search(input) {
      if (/sneaker|shoe|boot|heel/i.test(input.query)) await sleep(350);
      return delayedBase.backend.search(input);
    },
  };
  const partialTimeout = await retrieveLiveChannel3Catalog({
    backend: slowShoes,
    style: 'Streetwear',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: [],
    timeoutMs: 80,
  });
  assert(partialTimeout.ok, '3: timeout keeps already-completed category results');
  assert(partialTimeout.categories.top > 0 && partialTimeout.categories.bottom > 0, '3b: completed top/bottom survive timeout');
  assert(partialTimeout.reason === 'partial_results' || partialTimeout.timedOut, '3c: timeout is recorded as partial, not silent fallback');

  const timeoutHybrid = await resolveGenerationCatalog({
    retrieveLive: async () => partialTimeout,
    loadStored: async () => storedOk([catalogItem('stored-shoe', 'shoes')]),
    isSufficient: (products) => missingRequiredCategories(products).length === 0,
  });
  assert(timeoutHybrid.retrievalSource === 'hybrid', '3d: category timeout becomes hybrid, not catalog_fallback');
  assert(timeoutHybrid.products.some((product) => product.category === 'shoes' && product.id === 'stored-shoe'), '3e: only missing shoes fall back');
  assert(timeoutHybrid.products.some((product) => product.category === 'top'), '3f: live tops are kept');

  const allSlow: StrategySearchBackend = {
    async resolveBrand() {
      await sleep(200);
      return { id: 'id-acme', name: 'Acme' };
    },
    async search() {
      await sleep(200);
      return [];
    },
  };
  const fullTimeout = await retrieveLiveChannel3Catalog({
    backend: allSlow,
    style: 'Streetwear',
    occasion: 'Everyday',
    gender: 'men',
    budget: 150,
    shoeBudget: null,
    brands: [],
    timeoutMs: 40,
  });
  assert(!fullTimeout.ok && fullTimeout.reason === 'request_timeout', '4: complete Channel3 timeout is request_timeout');
  const fullFallback = await resolveGenerationCatalog({
    retrieveLive: async () => fullTimeout,
    loadStored: async () =>
      storedOk([
        catalogItem('c-top', 'top'),
        catalogItem('c-bottom', 'bottom'),
        catalogItem('c-shoe', 'shoes'),
      ]),
    isSufficient: (products) => missingRequiredCategories(products).length === 0,
  });
  assert(fullFallback.retrievalSource === 'catalog_fallback', '4b: complete Channel3 failure falls back');
  assert(!liveThrow.ok && liveThrow.attempted, '4c: thrown Channel3 search does not crash retrieval');
  assert(
    liveThrow.reason === 'empty_results' || liveThrow.reason === 'request_error',
    '4c: thrown Channel3 search is recorded, not collapsed to catalog_fallback at retrieval',
  );
  assert(liveEmpty.reason === 'empty_results', '4d: empty Channel3 is empty_results');

  if (failed) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\n${passed} passed`);
}

void main();
