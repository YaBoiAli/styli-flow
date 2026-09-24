import {
  absoluteUrl,
  classifyCategory,
  detectGender,
  isValidProduct,
  matchesFilters,
  parsePrice,
  sameSite,
} from '../normalize.ts';
import type {
  NormalizedProduct,
  ProductCategory,
  ProductFilters,
  ProductListing,
  ProductSource,
  SourceContext,
  SourceFactory,
} from '../types.ts';

const CATEGORY_QUERIES: Record<ProductCategory, string> = {
  top: 'shirts tops',
  bottom: 'pants jeans',
  shoes: 'shoes sneakers',
  outerwear: 'jackets',
  accessory: 'hats bags',
};

type SerpShoppingResult = {
  title?: string;
  link?: string;
  product_link?: string;
  product_id?: string;
  source?: string;
  extracted_price?: number;
  price?: string;
  thumbnail?: string;
};

/**
 * Final fallback via an external product-search provider (currently SerpApi Google Shopping).
 * Enabled only when EXTERNAL_PRODUCT_SEARCH_PROVIDER=serpapi and SERPAPI_API_KEY are set.
 * Results are kept only when they link directly to the brand's own domain.
 */
class ExternalProductSearchSource implements ProductSource {
  readonly type = 'external_search' as const;

  constructor(private readonly context: SourceContext) {}

  detect(): Promise<boolean> {
    return Promise.resolve(
      Deno.env.get('EXTERNAL_PRODUCT_SEARCH_PROVIDER') === 'serpapi' &&
        Boolean(Deno.env.get('SERPAPI_API_KEY')),
    );
  }

  async listProducts(limit: number): Promise<ProductListing> {
    const products: NormalizedProduct[] = [];
    for (const category of Object.keys(CATEGORY_QUERIES) as ProductCategory[]) {
      products.push(...(await this.search(`${this.context.brand.name} ${CATEGORY_QUERIES[category]}`)));
      if (products.length >= limit) break;
    }
    const unique = new Map(products.map((product) => [product.source_product_id, product]));
    return { products: [...unique.values()].slice(0, limit), complete: false };
  }

  async searchProducts(query: string, filters: ProductFilters = {}): Promise<NormalizedProduct[]> {
    const results = await this.search(`${this.context.brand.name} ${query}`);
    return results.filter((product) => matchesFilters(product, filters)).slice(0, filters.limit ?? 20);
  }

  getProduct(): Promise<NormalizedProduct | null> {
    // Search results are snapshots; refresh happens by re-running listProducts.
    return Promise.resolve(null);
  }

  private async search(query: string): Promise<NormalizedProduct[]> {
    const key = Deno.env.get('SERPAPI_API_KEY');
    if (!key) return [];
    const params = new URLSearchParams({ engine: 'google_shopping', q: query, api_key: key, gl: 'us', hl: 'en' });
    const response = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!response.ok) throw new Error(`external search returned HTTP ${response.status}`);
    const data = (await response.json()) as { shopping_results?: SerpShoppingResult[] };
    const now = this.context.now();
    const out: NormalizedProduct[] = [];
    for (const result of data.shopping_results ?? []) {
      const link = absoluteUrl(result.link, this.context.brand.origin);
      if (!link || !sameSite(link, this.context.brand.domain) || !result.title) continue;
      const classified = classifyCategory(null, result.title);
      const price = parsePrice(result.extracted_price ?? result.price);
      const image = absoluteUrl(result.thumbnail, this.context.brand.origin);
      if (!classified || price === null || !image) continue;
      const product: NormalizedProduct = {
        brand: this.context.brand.name,
        product_name: result.title,
        description: null,
        price,
        currency: 'USD',
        image_url: image,
        product_url: link,
        category: classified.category,
        subcategory: classified.subcategory,
        colors: [],
        sizes: [],
        material: null,
        gender: detectGender(result.title),
        availability: 'unknown',
        source: 'external_search',
        source_product_id: `${this.context.brand.domain}:${result.product_id ?? new URL(link).pathname}`,
        last_checked: now,
      };
      if (isValidProduct(product)) out.push(product);
    }
    return out;
  }
}

export const externalSearchSourceFactory: SourceFactory = {
  type: 'external_search',
  create: (context) => new ExternalProductSearchSource(context),
};
