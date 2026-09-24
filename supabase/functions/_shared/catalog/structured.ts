import {
  absoluteUrl,
  classifyCategory,
  cleanDescription,
  decodeEntities,
  detectGender,
  detectMaterial,
  isValidProduct,
  normalizeAvailability,
  parsePrice,
  sameSite,
  uniqueClean,
} from './normalize.ts';
import type { PoliteFetcher } from './politeFetch.ts';
import {
  AccessDeniedError,
  type Availability,
  type BrandInfo,
  type NormalizedProduct,
  type SourceType,
} from './types.ts';

type JsonLdNode = Record<string, unknown>;

/** Fields any page-level extractor yields before normalization. */
export type PageProduct = {
  name: string;
  description: string | null;
  image: string | null;
  brand: string | null;
  sku: string | null;
  price: number | null;
  currency: string | null;
  availability: Availability;
  colors: string[];
  sizes: string[];
  material: string | null;
  category: string | null;
  gender: string | null;
  url: string | null;
};

export function extractJsonLdProducts(html: string, pageUrl: string): PageProduct[] {
  const products: PageProduct[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    let data: unknown;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    for (const node of walk(data)) {
      const types = asArray(node['@type']).map(String);
      if (types.includes('ProductGroup')) {
        const group = fromProductGroup(node, pageUrl);
        if (group) products.push(group);
      } else if (types.includes('Product')) {
        const product = fromProductNode(node, pageUrl);
        if (product) products.push(product);
      }
    }
  }
  return products;
}

export function extractMetaProduct(html: string, pageUrl: string): PageProduct | null {
  const meta = new Map<string, string>();
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = match[0];
    const key = attr(tag, 'property') ?? attr(tag, 'name') ?? attr(tag, 'itemprop');
    const content = attr(tag, 'content');
    if (key && content && !meta.has(key.toLowerCase())) meta.set(key.toLowerCase(), content);
  }
  const ogType = meta.get('og:type')?.toLowerCase() ?? '';
  const price = parsePrice(
    meta.get('product:price:amount') ?? meta.get('og:price:amount') ?? meta.get('price'),
  );
  const name = meta.get('og:title');
  if (!name || price === null || (!ogType.includes('product') && !meta.has('product:price:amount'))) {
    return null;
  }
  return {
    name: decodeEntities(name),
    description: meta.get('og:description') ?? meta.get('description') ?? null,
    image: absoluteUrl(meta.get('og:image') ?? meta.get('og:image:secure_url'), pageUrl),
    brand: meta.get('product:brand') ?? meta.get('og:brand') ?? null,
    sku: meta.get('product:retailer_item_id') ?? meta.get('product:sku') ?? null,
    price,
    currency: meta.get('product:price:currency') ?? meta.get('og:price:currency') ?? null,
    availability: normalizeAvailability(meta.get('product:availability') ?? meta.get('og:availability')),
    colors: uniqueClean([meta.get('product:color')]),
    sizes: uniqueClean([meta.get('product:size')]),
    material: meta.get('product:material') ?? null,
    category: meta.get('product:category') ?? null,
    gender: meta.get('product:target_gender') ?? meta.get('product:gender') ?? null,
    url: absoluteUrl(meta.get('og:url'), pageUrl),
  };
}

export function toNormalized(
  page: PageProduct,
  context: { brand: BrandInfo; pageUrl: string; source: SourceType; now: string },
): NormalizedProduct | null {
  const productUrl = page.url && sameSite(page.url, context.brand.domain) ? page.url : context.pageUrl;
  if (!sameSite(productUrl, context.brand.domain)) return null;
  const classified = classifyCategory(page.category, page.name);
  if (!classified || page.price === null || !page.image) return null;
  const idPart = page.sku?.trim() || new URL(productUrl).pathname;
  const normalized: NormalizedProduct = {
    brand: page.brand?.trim() || context.brand.name,
    product_name: decodeEntities(page.name).trim(),
    description: cleanDescription(page.description),
    price: page.price,
    currency: /^[A-Z]{3}$/.test(page.currency ?? '') ? page.currency! : 'USD',
    image_url: page.image,
    product_url: productUrl,
    category: classified.category,
    subcategory: classified.subcategory,
    colors: page.colors,
    sizes: page.sizes,
    material: detectMaterial(page.material) ?? detectMaterial(page.description),
    gender: detectGender(page.gender, page.category, page.name, urlWords(page.url ?? context.pageUrl)),
    availability: page.availability,
    source: context.source,
    source_product_id: `${context.brand.domain}:${idPart}`,
    last_checked: context.now,
  };
  return isValidProduct(normalized) ? normalized : null;
}

function urlWords(url: string): string {
  try {
    return new URL(url).pathname.replace(/[/_\-.]+/g, ' ');
  } catch {
    return '';
  }
}

const PRODUCT_PATH_HINTS = /\/(products?|p|dp|item|items|shop\/[^/]+\/[^/]+)\/|\/p\d+|-p-\d+|\.html$|\/prd\//i;

/** Product page URLs discovered through robots.txt sitemaps (plain XML only). */
export async function discoverProductUrls(
  fetcher: PoliteFetcher,
  brand: BrandInfo,
  max: number,
): Promise<string[]> {
  const declared = await fetcher.sitemapsFor(brand.origin);
  const queue = declared.length ? [...declared] : [`${brand.origin}/sitemap.xml`];
  const productSitemapFirst = (a: string, b: string) =>
    Number(/product/i.test(b)) - Number(/product/i.test(a));
  queue.sort(productSitemapFirst);

  const found: string[] = [];
  const visited = new Set<string>();
  let sitemapsRead = 0;

  while (queue.length && found.length < max && sitemapsRead < 4) {
    const sitemap = queue.shift()!;
    if (visited.has(sitemap) || /\.gz($|\?)/i.test(sitemap)) continue;
    visited.add(sitemap);
    let xml: string;
    try {
      const result = await fetcher.getText(sitemap, {
        accept: 'application/xml,text/xml',
        maxBytes: 15 * 1024 * 1024,
      });
      if (result.status !== 200) continue;
      xml = result.text;
    } catch (err) {
      // A disallowed sitemap is skipped; a site-level block must surface to the resolver.
      if (err instanceof AccessDeniedError && err.reason !== 'robots') throw err;
      if (err instanceof Error && err.message === 'request budget exhausted') break;
      continue;
    }
    sitemapsRead += 1;
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
    if (/<sitemapindex/i.test(xml)) {
      queue.push(...locs.filter((loc) => sameSite(loc, brand.domain)));
      queue.sort(productSitemapFirst);
      continue;
    }
    const isProductSitemap = /product/i.test(sitemap);
    for (const loc of locs) {
      if (!sameSite(loc, brand.domain)) continue;
      if (isProductSitemap || PRODUCT_PATH_HINTS.test(new URL(loc).pathname)) {
        found.push(loc);
        if (found.length >= max) break;
      }
    }
  }
  return [...new Set(found)];
}

function fromProductNode(node: JsonLdNode, pageUrl: string): PageProduct | null {
  const name = typeof node.name === 'string' ? node.name : null;
  if (!name) return null;
  const offers = collectOffers(node.offers);
  const prices = offers.map((offer) => offer.price).filter((p): p is number => p !== null);
  return {
    name,
    description: typeof node.description === 'string' ? node.description : null,
    image: firstImage(node.image, pageUrl),
    brand: brandName(node.brand),
    sku: stringOf(node.sku) ?? stringOf(node.productID) ?? stringOf(node.mpn),
    price: prices.length ? Math.min(...prices) : null,
    currency: offers.find((offer) => offer.currency)?.currency ?? null,
    availability: bestAvailability(offers.map((offer) => offer.availability)),
    colors: uniqueClean(asArray(node.color).map(String)),
    sizes: uniqueClean(asArray(node.size).map((size) => (typeof size === 'object' && size ? String((size as JsonLdNode).name ?? '') : String(size)))),
    material: stringOf(node.material),
    category: stringOf(node.category),
    gender: audienceGender(node),
    url: absoluteUrl(node.url ?? offers.find((offer) => offer.url)?.url, pageUrl),
  };
}

function fromProductGroup(node: JsonLdNode, pageUrl: string): PageProduct | null {
  const variants = asArray(node.hasVariant)
    .filter((variant): variant is JsonLdNode => Boolean(variant) && typeof variant === 'object')
    .map((variant) => fromProductNode({ name: node.name, ...variant }, pageUrl))
    .filter((variant): variant is PageProduct => variant !== null);
  const base = fromProductNode(node, pageUrl);
  if (!variants.length) return base;
  const inStock = variants.filter((variant) => variant.availability === 'in_stock');
  const priced = (inStock.length ? inStock : variants)
    .map((variant) => variant.price)
    .filter((p): p is number => p !== null);
  return {
    name: String(node.name ?? variants[0].name),
    description: base?.description ?? variants[0].description,
    image: base?.image ?? variants.find((variant) => variant.image)?.image ?? null,
    brand: base?.brand ?? variants[0].brand,
    sku: stringOf(node.productGroupID) ?? base?.sku ?? variants[0].sku,
    price: priced.length ? Math.min(...priced) : null,
    currency: variants.find((variant) => variant.currency)?.currency ?? null,
    availability: bestAvailability(variants.map((variant) => variant.availability)),
    colors: uniqueClean(variants.flatMap((variant) => variant.colors)),
    sizes: uniqueClean(variants.flatMap((variant) => variant.sizes)),
    material: base?.material ?? variants[0].material,
    category: base?.category ?? variants[0].category,
    gender: base?.gender ?? variants[0].gender,
    url: absoluteUrl(node.url, pageUrl) ?? pageUrl,
  };
}

type Offer = { price: number | null; currency: string | null; availability: Availability; url: string | null };

function collectOffers(input: unknown): Offer[] {
  const out: Offer[] = [];
  for (const raw of asArray(input)) {
    if (!raw || typeof raw !== 'object') continue;
    const offer = raw as JsonLdNode;
    if (asArray(offer['@type']).includes('AggregateOffer')) {
      const nested = collectOffers(offer.offers);
      if (nested.length) {
        out.push(...nested);
        continue;
      }
      out.push({
        price: parsePrice(offer.lowPrice ?? offer.price),
        currency: stringOf(offer.priceCurrency),
        availability: normalizeAvailability(offer.availability),
        url: stringOf(offer.url),
      });
      continue;
    }
    const spec = offer.priceSpecification as JsonLdNode | undefined;
    out.push({
      price: parsePrice(offer.price ?? spec?.price),
      currency: stringOf(offer.priceCurrency ?? spec?.priceCurrency),
      availability: normalizeAvailability(offer.availability),
      url: stringOf(offer.url),
    });
  }
  return out;
}

function bestAvailability(values: Availability[]): Availability {
  if (values.includes('in_stock')) return 'in_stock';
  if (values.includes('out_of_stock')) return 'out_of_stock';
  if (values.includes('discontinued')) return 'discontinued';
  return 'unknown';
}

function* walk(data: unknown): Generator<JsonLdNode> {
  if (Array.isArray(data)) {
    for (const item of data) yield* walk(item);
    return;
  }
  if (!data || typeof data !== 'object') return;
  const node = data as JsonLdNode;
  yield node;
  if (Array.isArray(node['@graph'])) yield* walk(node['@graph']);
}

function firstImage(value: unknown, base: string): string | null {
  for (const item of asArray(value)) {
    const url = typeof item === 'string' ? item : (item as JsonLdNode | null)?.url ?? (item as JsonLdNode | null)?.contentUrl;
    const resolved = absoluteUrl(url, base);
    if (resolved) return resolved;
  }
  return null;
}

function brandName(value: unknown): string | null {
  const first = asArray(value)[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') return stringOf((first as JsonLdNode).name);
  return null;
}

function audienceGender(node: JsonLdNode): string | null {
  const audience = node.audience as JsonLdNode | undefined;
  return stringOf(audience?.suggestedGender) ?? stringOf(node.gender) ?? null;
}

function stringOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[2] ?? match[3] ?? null) : null;
}
