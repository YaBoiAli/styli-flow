import { runSearchStrategy } from '../_shared/catalog/searchStrategy/run.ts';
import type {
  SearchIntent,
  SearchStrategyLimits,
  SearchStrategyResult,
  StrategySearchBackend,
} from '../_shared/catalog/searchStrategy/types.ts';
import type { NormalizedProduct, ProductCategory, ProductGender } from '../_shared/catalog/types.ts';
import type { CatalogProduct, GenderPreference } from './catalog.ts';
import { matchesGenderPreference } from './catalog.ts';
import {
  type Channel3Reason,
  type MetadataPreservationStats,
  emptyMetadataStats,
  mapLegacyChannel3Reason,
} from './genTrace.ts';

export const LIVE_REQUIRED_CATEGORIES: ProductCategory[] = ['top', 'bottom', 'shoes'];

export const LIVE_STRATEGY_LIMITS: SearchStrategyLimits = {
  perQueryLimit: 8,
  maxQueries: 5,
  candidatePool: 40,
  finalCandidates: 10,
};

export const LIVE_RETRIEVAL_TIMEOUT_MS = 15_000;

export type LiveRetrievalSource = 'channel3_live' | 'hybrid' | 'catalog_fallback';

export type LiveRetrieval = {
  attempted: boolean;
  ok: boolean;
  reason: Channel3Reason | null;
  products: CatalogProduct[];
  fetched: number;
  queryCount: number;
  usable: number;
  categories: Record<ProductCategory, number>;
  unresolvedBrands: string[];
  timedOut: boolean;
  metadata: MetadataPreservationStats;
};

export function memoizeSearchBackend(backend: StrategySearchBackend): StrategySearchBackend {
  const brands = new Map<string, Promise<{ id: string; name: string } | null>>();
  const searches = new Map<string, Promise<Awaited<ReturnType<StrategySearchBackend['search']>>>>();
  return {
    resolveBrand(name) {
      const key = name.trim().toLowerCase();
      const hit = brands.get(key);
      if (hit) return hit;
      const pending = backend.resolveBrand(name);
      brands.set(key, pending);
      return pending;
    },
    search(input) {
      const key = JSON.stringify({
        query: input.query,
        brandId: input.brandId ?? '',
        brandName: input.brandName ?? '',
        websites: input.websites ?? [],
        limit: input.limit,
      });
      const hit = searches.get(key);
      if (hit) return hit;
      const pending = backend.search(input);
      searches.set(key, pending);
      return pending;
    },
  };
}

export function catalogProductFromNormalized(product: NormalizedProduct): CatalogProduct {
  const style_tags = [...(product.style_tags ?? [])];
  const occasion_tags = [...(product.occasion_tags ?? [])];
  const aesthetic_tags = [...(product.aesthetic_tags ?? [])];
  const season_tags = [...(product.season_tags ?? [])];
  const colors = [...(product.colors ?? [])];
  const sizes = [...(product.sizes ?? [])];
  return {
    id: product.source_product_id,
    name: product.product_name,
    brand: product.brand,
    brand_id: product.brand_id ?? null,
    category: product.category,
    subcategory: product.subcategory,
    price: product.price,
    currency: product.currency,
    color: colors[0] ?? '',
    colors,
    material: product.material,
    description: product.description,
    gender: product.gender,
    image_url: product.image_url,
    purchase_url: product.product_url,
    style_tags,
    occasion_tags,
    aesthetic_tags,
    season_tags,
    fit: product.fit ?? null,
    silhouette: product.silhouette ?? null,
    pattern: product.pattern ?? null,
    formality: product.formality ?? null,
    source: product.source,
    sizes,
    availability: product.availability,
    source_product_id: product.source_product_id,
    image_urls: product.image_urls?.length ? [...product.image_urls] : undefined,
  };
}

export function accumulateMetadataStats(
  stats: MetadataPreservationStats,
  incoming: NormalizedProduct,
  outgoing: CatalogProduct,
): void {
  stats.incoming_style_tags += incoming.style_tags?.length ?? 0;
  stats.preserved_style_tags += outgoing.style_tags.length;
  stats.incoming_colors += incoming.colors.length;
  stats.preserved_colors += outgoing.colors.length;
  stats.incoming_sizes += incoming.sizes.length;
  stats.preserved_sizes += outgoing.sizes?.length ?? 0;
}

export function countByCategory(products: CatalogProduct[]): Record<ProductCategory, number> {
  const counts: Record<ProductCategory, number> = {
    top: 0,
    bottom: 0,
    shoes: 0,
    outerwear: 0,
    accessory: 0,
  };
  for (const product of products) {
    if (counts[product.category] !== undefined) counts[product.category] += 1;
  }
  return counts;
}

export function missingRequiredCategories(
  products: CatalogProduct[],
  required: ProductCategory[] = LIVE_REQUIRED_CATEGORIES,
): ProductCategory[] {
  const counts = countByCategory(products);
  return required.filter((category) => counts[category] === 0);
}

export function toSearchGender(gender: GenderPreference): ProductGender | undefined {
  return gender === 'men' || gender === 'women' ? gender : undefined;
}

export function deriveChannel3Reason(input: {
  products: CatalogProduct[];
  fetched: number;
  timedOut: boolean;
  hadError: boolean;
  required: ProductCategory[];
}): Channel3Reason {
  const missing = missingRequiredCategories(input.products, input.required);
  if (!input.products.length) {
    if (input.timedOut) return 'request_timeout';
    if (input.hadError) return 'request_error';
    if (input.fetched > 0) return 'normalization_failed';
    return 'empty_results';
  }
  if (missing.length) {
    if (input.timedOut || input.hadError) return 'partial_results';
    return 'insufficient_categories';
  }
  return 'successful';
}

function emptyCategoryResult(category: ProductCategory): SearchStrategyResult {
  return {
    intent: { category },
    queries: [],
    unresolvedBrands: [],
    resolvedBrands: [],
    fetched: 0,
    duplicatesRemoved: 0,
    hardFiltered: 0,
    filterReasons: {},
    candidates: [],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retrieveLiveChannel3Catalog(input: {
  backend: StrategySearchBackend;
  style: string;
  occasion: string;
  gender: GenderPreference;
  budget: number;
  shoeBudget: number | null;
  brands: string[];
  websites?: string[];
  categories?: ProductCategory[];
  limits?: Partial<SearchStrategyLimits>;
  timeoutMs?: number;
}): Promise<LiveRetrieval> {
  const categories = input.categories ?? LIVE_REQUIRED_CATEGORIES;
  const backend = memoizeSearchBackend(input.backend);
  const limits = {
    ...LIVE_STRATEGY_LIMITS,
    ...(input.brands.length > 1 ? { maxQueries: Math.min(6, input.brands.length * 2) } : {}),
    ...input.limits,
  };
  const timeoutMs = input.timeoutMs ?? LIVE_RETRIEVAL_TIMEOUT_MS;

  console.log(
    `[CHANNEL3_LIVE] starting retrieval ${JSON.stringify({
      category_count: categories.length,
      brand_count: input.brands.length,
      query_budget: limits.maxQueries,
    })}`,
  );

  type Slot = SearchStrategyResult | 'pending' | 'error';
  const slots: Slot[] = categories.map(() => 'pending');
  const work = categories.map((category, index) =>
    runSearchStrategy(
      {
        style: input.style,
        occasion: input.occasion,
        category,
        gender: toSearchGender(input.gender),
        budget: input.budget,
        shoeBudget: input.shoeBudget,
        brands: input.brands,
        websites: input.websites,
      } satisfies SearchIntent,
      backend,
      limits,
    )
      .then((result) => {
        slots[index] = result;
      })
      .catch(() => {
        slots[index] = 'error';
      }),
  );

  await Promise.race([Promise.all(work), sleep(timeoutMs)]);

  let timedOut = false;
  let hadError = false;
  const results: SearchStrategyResult[] = [];
  for (let index = 0; index < categories.length; index += 1) {
    const slot = slots[index];
    if (slot === 'pending') {
      timedOut = true;
      results.push(emptyCategoryResult(categories[index]));
      continue;
    }
    if (slot === 'error') {
      hadError = true;
      results.push(emptyCategoryResult(categories[index]));
      continue;
    }
    results.push(slot);
  }

  const merged = new Map<string, CatalogProduct>();
  const metadata = emptyMetadataStats();
  let fetched = 0;
  let queryCount = 0;
  const unresolved = new Set<string>();
  for (const result of results) {
    fetched += result.fetched;
    queryCount += result.queries.length;
    for (const name of result.unresolvedBrands) unresolved.add(name);
    for (const candidate of result.candidates) {
      const product = catalogProductFromNormalized(candidate.product);
      accumulateMetadataStats(metadata, candidate.product, product);
      if (!matchesGenderPreference(product, input.gender)) continue;
      merged.set(product.id, product);
    }
  }

  const products = [...merged.values()];
  const reason = deriveChannel3Reason({
    products,
    fetched,
    timedOut,
    hadError,
    required: categories,
  });
  const complete: LiveRetrieval = {
    attempted: true,
    ok: products.length > 0,
    reason,
    products,
    fetched,
    queryCount,
    usable: products.length,
    categories: countByCategory(products),
    unresolvedBrands: [...unresolved],
    timedOut,
    metadata,
  };
  console.log(
    `[CHANNEL3_LIVE] retrieval complete ${JSON.stringify({
      used: complete.ok,
      query_count: complete.queryCount,
      fetched: complete.fetched,
      usable: complete.usable,
      categories: complete.categories,
      unresolved_brand_count: complete.unresolvedBrands.length,
      reason: complete.reason,
      timed_out: complete.timedOut,
    })}`,
  );
  return complete;
}

export function liveRetrievalFromError(reason: string): LiveRetrieval {
  return {
    attempted: true,
    ok: false,
    reason: mapLegacyChannel3Reason(reason),
    products: [],
    fetched: 0,
    queryCount: 0,
    usable: 0,
    categories: countByCategory([]),
    unresolvedBrands: [],
    timedOut: reason === 'timeout' || reason === 'request_timeout',
    metadata: emptyMetadataStats(),
  };
}
