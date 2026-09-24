export type ProductCategory = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';

export type ProductGender = 'men' | 'women' | 'unisex';

export type Availability = 'in_stock' | 'out_of_stock' | 'unknown' | 'discontinued';

export type SourceType =
  | 'official_api'
  | 'affiliate_feed'
  | 'shopify'
  | 'structured_data'
  | 'direct_website'
  | 'external_search';

/** Source-agnostic product shape every ProductSource must produce. */
export type NormalizedProduct = {
  brand: string;
  product_name: string;
  description: string | null;
  price: number;
  currency: string;
  image_url: string;
  product_url: string;
  category: ProductCategory;
  subcategory: string | null;
  colors: string[];
  sizes: string[];
  material: string | null;
  gender: ProductGender | null;
  availability: Availability;
  source: SourceType;
  /** Stable id within `source`, namespaced by domain so ids never collide across stores. */
  source_product_id: string;
  last_checked: string;
};

export type BrandInfo = {
  id?: string;
  name: string;
  /** Bare host without protocol or leading "www.", e.g. "kith.com". */
  domain: string;
  /** Preferred origin to request, e.g. "https://kith.com". */
  origin: string;
  sourceConfig: Record<string, unknown>;
};

export type ProductFilters = {
  category?: ProductCategory;
  maxPrice?: number;
  gender?: ProductGender;
  limit?: number;
};

export type ProductListing = {
  products: NormalizedProduct[];
  /** True only when the whole catalog was read, so missing items can be marked unavailable. */
  complete: boolean;
};

export interface ProductSource {
  readonly type: SourceType;
  /** Cheap probe: can this source serve the brand right now (configured, reachable, allowed)? */
  detect(): Promise<boolean>;
  /** Catalog pull used by ingestion. */
  listProducts(limit: number): Promise<ProductListing>;
  searchProducts(query: string, filters?: ProductFilters): Promise<NormalizedProduct[]>;
  getProduct(sourceProductId: string): Promise<NormalizedProduct | null>;
}

export type SourceContext = {
  brand: BrandInfo;
  fetcher: import('./politeFetch.ts').PoliteFetcher;
  now: () => string;
};

export type SourceFactory = {
  type: SourceType;
  create(context: SourceContext): ProductSource;
};

export type ResolveAttempt = {
  source: SourceType;
  outcome: 'skipped' | 'unavailable' | 'no_products' | 'blocked' | 'error' | 'succeeded';
  detail: string;
};

/** Raised when a site forbids or blocks automated access; never retried or worked around. */
export class AccessDeniedError extends Error {
  constructor(
    message: string,
    readonly reason: 'robots' | 'blocked' | 'rate_limited' | 'unsafe_url',
  ) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}
