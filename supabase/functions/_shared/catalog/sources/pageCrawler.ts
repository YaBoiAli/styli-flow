import { matchesFilters } from '../normalize.ts';
import { discoverProductUrls, type PageProduct, toNormalized } from '../structured.ts';
import {
  AccessDeniedError,
  type NormalizedProduct,
  type ProductFilters,
  type ProductListing,
  type ProductSource,
  type SourceContext,
  type SourceType,
} from '../types.ts';

const DETECT_SAMPLE = 3;
const DISCOVERY_MAX = 600;

/** Sitemaps are often grouped by category; interleave so a small sample spans the catalog. */
function shuffleSpread(urls: string[]): string[] {
  const stride = Math.max(1, Math.floor(urls.length / 50));
  const out: string[] = [];
  for (let offset = 0; offset < stride; offset += 1) {
    for (let i = offset; i < urls.length; i += stride) out.push(urls[i]);
  }
  return out;
}

/** Shared crawler for sources that read public product pages found via sitemaps. */
export class PageCrawlerSource implements ProductSource {
  private readonly cache = new Map<string, NormalizedProduct[]>();
  private discovered: { max: number; urls: string[] } | null = null;

  constructor(
    readonly type: SourceType,
    private readonly context: SourceContext,
    private readonly extract: (html: string, pageUrl: string) => PageProduct[],
  ) {}

  async detect(): Promise<boolean> {
    const urls = (await this.productUrls(DISCOVERY_MAX)).slice(0, DETECT_SAMPLE);
    for (const url of urls) {
      if ((await this.readPage(url)).length) return true;
    }
    return false;
  }

  async listProducts(limit: number): Promise<ProductListing> {
    const urls = await this.productUrls(Math.max(DISCOVERY_MAX, Math.ceil(limit * 1.5)));
    const products: NormalizedProduct[] = [];
    for (const url of urls) {
      if (products.length >= limit) break;
      try {
        products.push(...(await this.readPage(url)));
      } catch (err) {
        if (err instanceof AccessDeniedError) throw err;
        if (err instanceof Error && err.message === 'request budget exhausted') break;
      }
    }
    const unique = new Map(products.map((product) => [product.source_product_id, product]));
    // Sitemap sampling never proves a product is gone, so listings are never "complete".
    return { products: [...unique.values()].slice(0, limit), complete: false };
  }

  async searchProducts(query: string, filters: ProductFilters = {}): Promise<NormalizedProduct[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const { products } = await this.listProducts(Math.max(filters.limit ?? 20, 20));
    return products
      .filter((product) => matchesFilters(product, filters))
      .filter((product) => {
        const haystack = `${product.product_name} ${product.description ?? ''}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, filters.limit ?? 20);
  }

  async getProduct(sourceProductId: string): Promise<NormalizedProduct | null> {
    const ref = sourceProductId.slice(sourceProductId.indexOf(':') + 1);
    if (!ref.startsWith('/')) return null;
    const products = await this.readPage(`${this.context.brand.origin}${ref}`);
    return products[0] ?? null;
  }

  private async productUrls(max: number): Promise<string[]> {
    if (!this.discovered || this.discovered.max < max) {
      const urls = await discoverProductUrls(this.context.fetcher, this.context.brand, max);
      this.discovered = { max, urls: shuffleSpread(urls) };
    }
    return this.discovered.urls;
  }

  private async readPage(url: string): Promise<NormalizedProduct[]> {
    const cached = this.cache.get(url);
    if (cached) return cached;
    const result = await this.context.fetcher.getText(url, { maxBytes: 4 * 1024 * 1024 });
    if (result.status !== 200) {
      this.cache.set(url, []);
      return [];
    }
    const now = this.context.now();
    const normalized = this.extract(result.text, result.url)
      .map((page) =>
        toNormalized(page, { brand: this.context.brand, pageUrl: result.url, source: this.type, now }),
      )
      .filter((product): product is NormalizedProduct => product !== null);
    this.cache.set(url, normalized);
    return normalized;
  }
}
