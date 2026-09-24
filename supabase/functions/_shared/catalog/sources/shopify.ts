import {
  absoluteUrl,
  classifyCategory,
  cleanDescription,
  detectGender,
  detectMaterial,
  isValidProduct,
  matchesFilters,
  parsePrice,
  uniqueClean,
} from '../normalize.ts';
import type {
  NormalizedProduct,
  ProductFilters,
  ProductListing,
  ProductSource,
  SourceContext,
  SourceFactory,
} from '../types.ts';

const PAGE_SIZE = 250;
const MAX_PAGES = 8;

type ShopifyVariant = {
  id: number;
  price: string;
  available?: boolean;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
};

type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  tags?: string[] | string;
  options?: Array<{ name: string; position: number; values: string[] }>;
  variants?: ShopifyVariant[];
  images?: Array<{ src: string }>;
};

/**
 * Reads a Shopify storefront's public catalog endpoints (/products.json, /meta.json).
 * Works per store with no API key; stores that disable these endpoints are simply not detected.
 */
class ShopifySource implements ProductSource {
  readonly type = 'shopify' as const;
  private currency: string | null = null;

  constructor(private readonly context: SourceContext) {}

  async detect(): Promise<boolean> {
    const data = await this.context.fetcher.getJson<{ products?: unknown[] }>(
      `${this.context.brand.origin}/products.json?limit=1`,
    );
    return Array.isArray(data?.products);
  }

  async listProducts(limit: number): Promise<ProductListing> {
    const products: NormalizedProduct[] = [];
    let complete = false;
    const pages = Math.min(MAX_PAGES, Math.ceil(limit / PAGE_SIZE) || 1);
    for (let page = 1; page <= pages; page += 1) {
      const raw = await this.fetchPage(page);
      for (const item of raw) {
        const normalized = await this.normalize(item);
        if (normalized) products.push(normalized);
      }
      if (raw.length < PAGE_SIZE) {
        complete = true;
        break;
      }
      if (products.length >= limit) break;
    }
    return { products: products.slice(0, limit), complete };
  }

  async searchProducts(query: string, filters: ProductFilters = {}): Promise<NormalizedProduct[]> {
    const limit = Math.min(filters.limit ?? 10, 10);
    const params = new URLSearchParams({
      q: query,
      'resources[type]': 'product',
      'resources[limit]': String(limit),
    });
    const data = await this.context.fetcher.getJson<{
      resources?: { results?: { products?: Array<{ handle: string }> } };
    }>(`${this.context.brand.origin}/search/suggest.json?${params}`);
    const handles = data?.resources?.results?.products?.map((item) => item.handle) ?? [];
    const results: NormalizedProduct[] = [];
    for (const handle of handles) {
      const product = await this.fetchByHandle(handle);
      if (product && matchesFilters(product, filters)) results.push(product);
    }
    return results;
  }

  async getProduct(sourceProductId: string): Promise<NormalizedProduct | null> {
    const id = Number(sourceProductId.split(':').pop());
    if (!Number.isFinite(id)) return null;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const raw = await this.fetchPage(page);
      const match = raw.find((item) => item.id === id);
      if (match) return this.normalize(match);
      if (raw.length < PAGE_SIZE) break;
    }
    return null;
  }

  private async fetchPage(page: number): Promise<ShopifyProduct[]> {
    const data = await this.context.fetcher.getJson<{ products?: ShopifyProduct[] }>(
      `${this.context.brand.origin}/products.json?limit=${PAGE_SIZE}&page=${page}`,
      { maxBytes: 20 * 1024 * 1024 },
    );
    return data?.products ?? [];
  }

  private async fetchByHandle(handle: string): Promise<NormalizedProduct | null> {
    const data = await this.context.fetcher.getJson<{ product?: ShopifyProduct }>(
      `${this.context.brand.origin}/products/${encodeURIComponent(handle)}.json`,
    );
    return data?.product ? this.normalize(data.product) : null;
  }

  private async storeCurrency(): Promise<string> {
    if (this.currency) return this.currency;
    const meta = await this.context.fetcher
      .getJson<{ currency?: string }>(`${this.context.brand.origin}/meta.json`)
      .catch(() => null);
    this.currency = /^[A-Z]{3}$/.test(meta?.currency ?? '') ? meta!.currency! : 'USD';
    return this.currency;
  }

  private async normalize(item: ShopifyProduct): Promise<NormalizedProduct | null> {
    const tags = Array.isArray(item.tags)
      ? item.tags
      : (item.tags ?? '').split(',').map((tag) => tag.trim());
    const classified = classifyCategory(item.product_type, item.title, tags);
    if (!classified) return null;

    const variants = item.variants ?? [];
    const availableVariants = variants.filter((variant) => variant.available !== false);
    const priced = (availableVariants.length ? availableVariants : variants)
      .map((variant) => parsePrice(variant.price))
      .filter((price): price is number => price !== null);
    if (!priced.length) return null;

    const optionValues = (pattern: RegExp) => {
      const option = item.options?.find((opt) => pattern.test(opt.name));
      if (!option) return [];
      const key = `option${option.position}` as 'option1' | 'option2' | 'option3';
      const fromVariants = (availableVariants.length ? availableVariants : variants).map(
        (variant) => variant[key],
      );
      return uniqueClean(fromVariants.length ? fromVariants : option.values);
    };

    const origin = this.context.brand.origin;
    const image = absoluteUrl(item.images?.[0]?.src, origin);
    if (!image) return null;

    const product: NormalizedProduct = {
      brand: item.vendor?.trim() || this.context.brand.name,
      product_name: item.title.trim(),
      description: cleanDescription(item.body_html),
      price: Math.min(...priced),
      currency: await this.storeCurrency(),
      image_url: image,
      product_url: `${origin}/products/${item.handle}`,
      category: classified.category,
      subcategory: classified.subcategory,
      colors: optionValues(/colou?r/i).length
        ? optionValues(/colou?r/i)
        : colorFromTitle(item.title),
      sizes: optionValues(/size/i),
      material: detectMaterial(item.body_html, tags.join(' ')),
      gender: detectGender(item.product_type, tags.join(' '), item.title, item.handle.replace(/-/g, ' ')),
      availability: variants.length === 0
        ? 'unknown'
        : availableVariants.length > 0
        ? 'in_stock'
        : 'out_of_stock',
      source: 'shopify',
      source_product_id: `${this.context.brand.domain}:${item.id}`,
      last_checked: this.context.now(),
    };
    return isValidProduct(product) ? product : null;
  }
}

/** Many stores put the colorway after the last " - " in the title, e.g. "990v4 - Navy / Grey". */
function colorFromTitle(title: string): string[] {
  const suffix = title.split(' - ').slice(1).pop()?.trim();
  if (!suffix || suffix.length > 60 || /\d{2,}/.test(suffix)) return [];
  return uniqueClean([suffix.replace(/\s*\([^)]*\)\s*$/, '')]);
}

export const shopifySourceFactory: SourceFactory = {
  type: 'shopify',
  create: (context) => new ShopifySource(context),
};
