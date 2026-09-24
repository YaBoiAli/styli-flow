import type {
  NormalizedProduct,
  ProductListing,
  ProductSource,
  SourceContext,
  SourceFactory,
} from '../types.ts';

/**
 * Brand-specific official API adapters, keyed by brand domain. Add an entry when a retailer
 * grants API access; each adapter reads its own credentials from environment secrets.
 */
export const OFFICIAL_API_ADAPTERS: Record<string, (context: SourceContext) => ProductSource> = {};

class UnavailableSource implements ProductSource {
  readonly type = 'official_api' as const;
  detect(): Promise<boolean> {
    return Promise.resolve(false);
  }
  listProducts(): Promise<ProductListing> {
    return Promise.resolve({ products: [], complete: false });
  }
  searchProducts(): Promise<NormalizedProduct[]> {
    return Promise.resolve([]);
  }
  getProduct(): Promise<NormalizedProduct | null> {
    return Promise.resolve(null);
  }
}

export const officialApiSourceFactory: SourceFactory = {
  type: 'official_api',
  create: (context) =>
    OFFICIAL_API_ADAPTERS[context.brand.domain]?.(context) ?? new UnavailableSource(),
};
