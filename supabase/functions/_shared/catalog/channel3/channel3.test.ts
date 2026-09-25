/**
 * Channel3 provider unit tests. No live API calls.
 * Run: npm run test:channel3-unit
 */
import { Channel3Client } from './client.ts';
import {
  CHANNEL3_ID_PREFIX,
  CHANNEL3_SOURCE,
  channel3SourceProductId,
  isChannel3SourceProductId,
  mapChannel3Availability,
  mapChannel3Category,
  normalizeChannel3Product,
  pickBrandMatch,
  selectChannel3Image,
  selectChannel3Offer,
} from './normalize.ts';
import { buildChannel3Filters, buildChannel3Query } from './query.ts';
import { clampChannel3Limit, parseChannel3SyncParams } from './sync.ts';
import { Channel3Error, reasonForStatus, type Channel3Product } from './types.ts';
import { dedupeNormalizedProducts } from '../ingest.ts';

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

const now = '2026-09-25T10:00:00.000Z';

function product(partial: Partial<Channel3Product> & Pick<Channel3Product, 'id' | 'title'>): Channel3Product {
  return {
    images: [{ url: 'https://cdn.example.com/a.jpg', is_main_image: true }],
    offers: [
      {
        url: 'https://shop.example.com/p/1',
        domain: 'shop.example.com',
        price: { price: 48, currency: 'USD' },
        availability: 'InStock',
      },
    ],
    category: { slug: 't-shirts', title: 'T-Shirts', path: [], has_children: false },
    brands: [{ id: 'brand-1', name: 'Example Brand' }],
    ...partial,
  };
}

const parsed = JSON.parse(
  JSON.stringify({
    products: [product({ id: 'c3_abc', title: 'Cotton Tee' })],
    next_page_token: 'page-2',
  }),
);
assert(Array.isArray(parsed.products) && parsed.products[0].id === 'c3_abc', '1: search response parses');
assert(parsed.next_page_token === 'page-2', '1b: page token preserved');

const normalized = normalizeChannel3Product(product({ id: 'c3_abc', title: 'Cotton Tee' }), { now });
assert(normalized.ok && normalized.product.product_name === 'Cotton Tee', '2: title maps');
assert(normalized.ok && normalized.product.brand === 'Example Brand', '2b: brand maps');
assert(normalized.ok && normalized.product.source === CHANNEL3_SOURCE, '2c: source is persisted catalog type');
assert(
  normalized.ok && normalized.product.source_product_id === 'channel3:c3_abc',
  '9: source_product_id uses Channel3 id',
);
assert(isChannel3SourceProductId(channel3SourceProductId('c3_abc')), '9b: prefix helper');
assert(CHANNEL3_ID_PREFIX === 'channel3:', '9c: stable prefix');

const tee = mapChannel3Category(product({ id: '1', title: 'Everyday Tee', category: { slug: 't-shirts', title: 'T-Shirts', path: [], has_children: false } }));
assert(tee?.category === 'top' && tee.subcategory === 't-shirt', '3: t-shirts → top/t-shirt');
const jeans = mapChannel3Category(product({ id: '2', title: 'Slim Jeans', category: { slug: 'jeans', title: 'Jeans', path: [], has_children: false } }));
assert(jeans?.category === 'bottom' && jeans.subcategory === 'jeans', '3b: jeans → bottom');
const sneakers = mapChannel3Category(product({ id: '3', title: 'Runner', category: { slug: 'sneakers', title: 'Sneakers', path: [], has_children: false } }));
assert(sneakers?.category === 'shoes', '3c: sneakers → shoes');
const jacket = mapChannel3Category(product({ id: '4', title: 'Bomber', category: { slug: 'jackets', title: 'Jackets', path: [], has_children: false } }));
assert(jacket?.category === 'outerwear', '3d: jackets → outerwear');
const bag = mapChannel3Category(product({ id: '5', title: 'Tote', category: { slug: 'tote-bags', title: 'Tote Bags', path: [], has_children: false } }));
assert(bag?.category === 'accessory', '3e: bags → accessory');
const unknown = mapChannel3Category(product({
  id: '6',
  title: 'Mystery Object',
  category: { slug: 'sofas', title: 'Sofas', path: [{ slug: 'furniture', title: 'Furniture' }], has_children: false },
}));
assert(unknown === null, '3f: unmapped furniture is not invented');

const priced = normalizeChannel3Product(
  product({
    id: 'price-1',
    title: 'Priced Tee',
    offers: [{
      url: 'https://shop.example.com/p/2',
      domain: 'shop.example.com',
      price: { price: 32.5, compare_at_price: 40, currency: 'USD' },
      availability: 'InStock',
    }],
  }),
  { now },
);
assert(priced.ok && priced.product.price === 32.5 && priced.product.currency === 'USD', '4: uses offer price, not compare-at');

assert(mapChannel3Availability('InStock') === 'in_stock', '5: InStock → in_stock');
assert(mapChannel3Availability('OutOfStock') === 'out_of_stock', '5b: OutOfStock → out_of_stock');

const image = selectChannel3Image([
  { url: 'https://cdn.example.com/raw.jpg', cleaned_url: 'https://cdn.example.com/clean.jpg', is_main_image: true },
  { url: 'https://cdn.example.com/other.jpg' },
]);
assert(image === 'https://cdn.example.com/clean.jpg', '6: prefers cleaned main image');
assert(selectChannel3Image([{ url: 'not-a-url' }]) === null, '12: invalid image skipped');
assert(selectChannel3Image([]) === null, '12b: empty images skipped');

const offers = [
  {
    url: 'https://other.com/p',
    domain: 'other.com',
    price: { price: 20, currency: 'USD' },
    availability: 'InStock' as const,
  },
  {
    url: 'https://preferred.com/p',
    domain: 'preferred.com',
    price: { price: 28, currency: 'USD' },
    availability: 'InStock' as const,
  },
  {
    url: 'https://cheap-eur.com/p',
    domain: 'cheap-eur.com',
    price: { price: 10, currency: 'EUR' },
    availability: 'InStock' as const,
  },
  {
    url: 'https://oos.com/p',
    domain: 'oos.com',
    price: { price: 5, currency: 'USD' },
    availability: 'OutOfStock' as const,
  },
];
assert(selectChannel3Offer(offers, ['preferred.com'])?.domain === 'preferred.com', '7: preferred website wins');
assert(selectChannel3Offer(offers)?.price.price === 20, '7b: otherwise cheapest in-stock USD');
assert(selectChannel3Offer(offers.filter((offer) => offer.availability === 'OutOfStock')) === null, '7c: OOS-only rejected');

const brands = [
  { id: 'b1', name: 'Acme' },
  { id: 'b2', name: 'Acme Sport' },
];
assert(pickBrandMatch(brands, 'Acme')?.id === 'b1', '8: exact brand name match');
assert(pickBrandMatch(brands, 'Unknown Co') === null, '8b: no guessed brand id');
assert(buildChannel3Filters({ brandIds: ['b1'] }).brand_ids?.[0] === 'b1', '8c: brand filter uses resolved id');
assert(buildChannel3Filters({ websites: ['nike.com'] }).website_ids?.[0] === 'nike.com', '8d: website filter uses domain');

const first = normalizeChannel3Product(product({ id: 'dup', title: 'One' }), { now });
const second = normalizeChannel3Product(product({ id: 'dup', title: 'Two' }), { now });
assert(first.ok && second.ok, '10: both normalize');
const deduped = dedupeNormalizedProducts([first.product, second.product]);
assert(deduped.length === 1 && deduped[0].product_name === 'Two', '10b: source+id dedupes');

assert(normalizeChannel3Product({ id: '', title: 'X' } as Channel3Product, { now }).reason === 'missing_id', '11: missing id skipped');
assert(
  normalizeChannel3Product(product({ id: 'x', title: '   ' }), { now }).reason === 'missing_title',
  '11b: missing title skipped',
);
assert(
  normalizeChannel3Product(product({ id: 'sofa', title: 'Cloud Sofa', category: { slug: 'sofas', title: 'Sofas', path: [], has_children: false } }), { now }).reason === 'unmapped_category',
  '11c: unmapped category skipped',
);

assert(
  normalizeChannel3Product(product({ id: 'no-img', title: 'Tee', images: [] }), { now }).reason === 'no_image',
  '12c: missing image skipped',
);
assert(
  normalizeChannel3Product(
    product({
      id: 'no-price',
      title: 'Tee',
      offers: [{ url: 'https://shop.example.com/p', domain: 'shop.example.com', price: { price: 0, currency: 'USD' }, availability: 'InStock' }],
    }),
    { now },
  ).reason === 'no_offer',
  '13: missing/invalid price skipped',
);

assert(reasonForStatus(401) === 'unauthorized', '14: 401');
assert(reasonForStatus(403) === 'unauthorized', '14b: 403');
assert(reasonForStatus(429) === 'rate_limited', '14c: 429');
assert(reasonForStatus(500) === 'upstream_error', '14d: 5xx');
assert(reasonForStatus(400) === 'request_error', '14e: 4xx');

async function runClientTests() {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const client = new Channel3Client('test-key', {
    fetch: async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body });
      if (url.includes('/v1/brands/search')) {
        return new Response(JSON.stringify({ brands: [{ id: 'resolved-1', name: 'Acme' }] }), { status: 200 });
      }
      if (body?.page_token === 'page-2') {
        return new Response(JSON.stringify({ products: [product({ id: 'p2', title: 'Second' })] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          products: [product({ id: 'p1', title: 'First' })],
          next_page_token: 'page-2',
        }),
        { status: 200 },
      );
    },
  });

  const brands = await client.searchBrands('Acme');
  assert(brands.brands[0].id === 'resolved-1', '8e: brand search uses official endpoint');
  assert(calls[0].url.includes('/v1/brands/search?query=Acme'), '8f: brand query is dynamic');

  const pages = await client.searchPages({ query: 'casual shirts', limit: 40, maxPages: 3 });
  assert(pages.pages === 2 && pages.products.length === 2, '15: follows next_page_token');
  assert(calls[1].body.query === 'casual shirts', '15b: search query is caller-provided');
  assert(calls[1].url.endsWith('/v1/search'), '15c: POST /v1/search');
  assert(calls[2].body.page_token === 'page-2', '15d: second page uses token');

  const failing = new Channel3Client('test-key', {
    fetch: async () => new Response('nope', { status: 429 }),
  });
  try {
    await failing.search({ query: 'x' });
    assert(false, '14f: 429 should throw');
  } catch (err) {
    assert(err instanceof Channel3Error && err.reason === 'rate_limited', '14f: rate limit error');
  }

  const malformed = new Channel3Client('test-key', {
    fetch: async () => new Response(JSON.stringify({ nope: true }), { status: 200 }),
  });
  try {
    await malformed.search({ query: 'x' });
    assert(false, '14g: malformed should throw');
  } catch (err) {
    assert(err instanceof Channel3Error && err.reason === 'malformed_response', '14g: malformed search');
  }

  try {
    new Channel3Client('');
    assert(false, '14h: empty key should throw');
  } catch (err) {
    assert(err instanceof Channel3Error && err.reason === 'missing_api_key', '14h: missing key');
  }
}

assert(buildChannel3Query({ style: 'Streetwear', category: 'top' })?.includes('Streetwear'), 'query: style+category');
assert(buildChannel3Query({}) === null, 'query: empty intent has no default retailer');
assert(buildChannel3Query({ brands: ['Acme'] }) === 'Acme', 'query: brand name can seed search');
assert(parseChannel3SyncParams({ brand: 'Acme', website: 'acme.com' }).brands?.[0] === 'Acme', 'params: brand list');
assert(parseChannel3SyncParams({}).brands?.length === 0, 'params: no hardcoded retailer');
assert(clampChannel3Limit(999) === 50, 'limit: capped');
assert(normalizeChannel3Product(product({ id: 'e1', title: 'Tee' }), { now }).ok, '16: enrichment-compatible shape');
if (normalized.ok) {
  assert(typeof normalized.product.category === 'string', '16b: category present for enrich');
  assert(/^https?:\/\//.test(normalized.product.image_url), '16c: image url present for enrich');
}

async function main() {
  await runClientTests();
  if (failed) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\n${passed} passed`);
}

void main();
