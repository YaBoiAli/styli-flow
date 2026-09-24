import { parseFeed } from '../feeds.ts';
import {
  absoluteUrl,
  classifyCategory,
  cleanDescription,
  detectGender,
  detectMaterial,
  isValidProduct,
  matchesFilters,
  normalizeAvailability,
  parsePrice,
  uniqueClean,
} from '../normalize.ts';
import { assertSafeUrl } from '../politeFetch.ts';
import type {
  NormalizedProduct,
  ProductFilters,
  ProductListing,
  ProductSource,
  SourceContext,
  SourceFactory,
} from '../types.ts';

export type AffiliateNetwork = 'awin' | 'cj' | 'rakuten' | 'impact';

/**
 * Non-secret config stored in brands.source_config.affiliate. The feed URL (which embeds the
 * publisher's credentials) lives only in the environment variable named by `feed_url_env`.
 */
export type AffiliateConfig = {
  network: AffiliateNetwork;
  /** Column layout of the exported feed. CJ, Rakuten and Impact can all export Google format. */
  format?: 'awin' | 'google';
  feed_url_env: string;
  /** Optional: keep only rows whose brand column matches (for multi-brand retailer feeds). */
  brand_filter?: string;
};

const MAX_FEED_BYTES = 60 * 1024 * 1024;
const FEED_TIMEOUT_MS = 60_000;

type FeedRow = Record<string, string>;

type FieldMap = {
  id: string[];
  group: string[];
  title: string[];
  description: string[];
  price: string[];
  salePrice: string[];
  currency: string[];
  image: string[];
  link: string[];
  availability: string[];
  brand: string[];
  color: string[];
  size: string[];
  gender: string[];
  material: string[];
  category: string[];
};

const FIELD_MAPS: Record<'awin' | 'google', FieldMap> = {
  awin: {
    id: ['aw_product_id', 'merchant_product_id'],
    group: ['parent_product_id', 'product_GTIN'],
    title: ['product_name'],
    description: ['description', 'product_short_description'],
    price: ['store_price', 'search_price', 'rrp_price'],
    salePrice: ['search_price'],
    currency: ['currency'],
    image: ['merchant_image_url', 'large_image', 'aw_image_url'],
    link: ['merchant_deep_link', 'aw_deep_link'],
    availability: ['in_stock', 'stock_status'],
    brand: ['brand_name'],
    color: ['colour', 'Fashion:colour'],
    size: ['Fashion:size', 'size'],
    gender: ['Fashion:suitable_for', 'gender'],
    material: ['Fashion:material', 'material'],
    category: ['product_type', 'merchant_category', 'category_name'],
  },
  google: {
    id: ['id', 'g:id'],
    group: ['item_group_id'],
    title: ['title'],
    description: ['description'],
    price: ['price'],
    salePrice: ['sale_price'],
    currency: ['currency'],
    image: ['image_link'],
    link: ['link'],
    availability: ['availability'],
    brand: ['brand'],
    color: ['color'],
    size: ['size'],
    gender: ['gender'],
    material: ['material'],
    category: ['product_type', 'google_product_category'],
  },
};

class AffiliateFeedSource implements ProductSource {
  readonly type = 'affiliate_feed' as const;
  private rows: FeedRow[] | null = null;

  constructor(private readonly context: SourceContext) {}

  private get config(): AffiliateConfig | null {
    const raw = this.context.brand.sourceConfig.affiliate as AffiliateConfig | undefined;
    return raw?.network && raw.feed_url_env ? raw : null;
  }

  detect(): Promise<boolean> {
    const config = this.config;
    return Promise.resolve(Boolean(config && Deno.env.get(config.feed_url_env)));
  }

  async listProducts(limit: number): Promise<ProductListing> {
    const rows = await this.loadRows();
    const products = this.normalizeRows(rows);
    return { products: products.slice(0, limit), complete: products.length <= limit };
  }

  async searchProducts(query: string, filters: ProductFilters = {}): Promise<NormalizedProduct[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const products = this.normalizeRows(await this.loadRows());
    return products
      .filter((product) => matchesFilters(product, filters))
      .filter((product) => terms.every((term) => product.product_name.toLowerCase().includes(term)))
      .slice(0, filters.limit ?? 20);
  }

  async getProduct(sourceProductId: string): Promise<NormalizedProduct | null> {
    const products = this.normalizeRows(await this.loadRows());
    return products.find((product) => product.source_product_id === sourceProductId) ?? null;
  }

  private async loadRows(): Promise<FeedRow[]> {
    if (this.rows) return this.rows;
    const config = this.config;
    const feedUrl = config ? Deno.env.get(config.feed_url_env) : undefined;
    if (!config || !feedUrl) throw new Error('affiliate feed not configured');

    // Authorized feed download from the network (not a crawl), so robots.txt does not apply.
    const url = assertSafeUrl(feedUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    try {
      const response = await fetch(url.href, {
        signal: controller.signal,
        headers: { 'User-Agent': this.context.fetcher.userAgent },
      });
      if (!response.ok || !response.body) {
        throw new Error(`affiliate feed returned HTTP ${response.status}`);
      }
      const length = Number(response.headers.get('content-length') ?? '0');
      if (length > MAX_FEED_BYTES) throw new Error('affiliate feed too large; filter it by brand');
      const gzipped =
        /\.gz($|\?)/i.test(url.pathname) ||
        /gzip/i.test(response.headers.get('content-type') ?? '');
      const stream = gzipped
        ? response.body.pipeThrough(new DecompressionStream('gzip'))
        : response.body;
      const text = await new Response(stream).text();
      if (text.length > MAX_FEED_BYTES * 3) throw new Error('affiliate feed too large; filter it by brand');
      this.rows = parseFeed(text);
      return this.rows;
    } finally {
      clearTimeout(timer);
    }
  }

  private normalizeRows(rows: FeedRow[]): NormalizedProduct[] {
    const config = this.config!;
    const map = FIELD_MAPS[config.format ?? (config.network === 'awin' ? 'awin' : 'google')];
    const pick = (row: FeedRow, keys: string[]) => {
      for (const key of keys) {
        const value = row[key] ?? row[`g:${key}`];
        if (value) return value;
      }
      return '';
    };

    const groups = new Map<string, FeedRow[]>();
    for (const row of rows) {
      if (config.brand_filter) {
        const brand = pick(row, map.brand).toLowerCase();
        if (brand && brand !== config.brand_filter.toLowerCase()) continue;
      }
      const key = pick(row, map.group) || pick(row, map.id);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const now = this.context.now();
    const products: NormalizedProduct[] = [];
    for (const [groupId, variants] of groups) {
      const first = variants[0];
      const title = pick(first, map.title);
      const categoryText = pick(first, map.category);
      const classified = classifyCategory(categoryText, title);
      if (!classified) continue;

      const available = variants.filter(
        (row) => normalizeAvailability(pick(row, map.availability)) !== 'out_of_stock',
      );
      const priceRows = available.length ? available : variants;
      const prices = priceRows
        .map((row) => parsePrice(pick(row, map.salePrice)) ?? parsePrice(pick(row, map.price)))
        .filter((price): price is number => price !== null);
      const link = absoluteUrl(pick(first, map.link), this.context.brand.origin);
      const image = absoluteUrl(pick(first, map.image), this.context.brand.origin);
      if (!prices.length || !link || !image) continue;

      const currency =
        pick(first, map.currency).toUpperCase() ||
        (pick(first, map.price).match(/\b([A-Z]{3})\b/)?.[1] ?? 'USD');
      const description = pick(first, map.description);

      const product: NormalizedProduct = {
        brand: pick(first, map.brand) || this.context.brand.name,
        product_name: title,
        description: cleanDescription(description),
        price: Math.min(...prices),
        currency,
        image_url: image,
        product_url: link,
        category: classified.category,
        subcategory: classified.subcategory,
        colors: uniqueClean(variants.map((row) => pick(row, map.color))),
        sizes: uniqueClean(variants.map((row) => pick(row, map.size))),
        material: pick(first, map.material) || detectMaterial(description),
        gender: detectGender(pick(first, map.gender), categoryText, title),
        availability: available.length ? 'in_stock' : 'out_of_stock',
        source: 'affiliate_feed',
        source_product_id: `${this.context.brand.domain}:${config.network}:${groupId}`,
        last_checked: now,
      };
      if (isValidProduct(product)) products.push(product);
    }
    return products;
  }
}

export const affiliateFeedSourceFactory: SourceFactory = {
  type: 'affiliate_feed',
  create: (context) => new AffiliateFeedSource(context),
};
