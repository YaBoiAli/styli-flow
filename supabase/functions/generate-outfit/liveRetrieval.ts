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
  reason: string | null;
  products: CatalogProduct[];
  fetched: number;
  queryCount: number;
  usable: number;
  categories: Record<ProductCategory, number>;
  unresolvedBrands: string[];
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
  return {
    id: product.source_product_id,
    name: product.product_name,
    brand: product.brand,
    brand_id: null,
    category: product.category,
    subcategory: product.subcategory,
    price: product.price,
    currency: product.currency,
    color: product.colors[0] ?? 'Assorted',
    colors: product.colors,
    material: product.material,
    description: product.description,
    gender: product.gender,
    image_url: product.image_url,
    purchase_url: product.product_url,
    style_tags: [],
    occasion_tags: [],
    aesthetic_tags: [],
    season_tags: [],
    fit: null,
    silhouette: null,
    pattern: null,
    formality: null,
    source: product.source,
  };
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

  try {
    console.log(
      `[CHANNEL3_LIVE] starting retrieval ${JSON.stringify({
        category_count: categories.length,
        brand_count: input.brands.length,
        query_budget: limits.maxQueries,
      })}`,
    );
    const results = await withTimeout(
      Promise.all(
        categories.map((category) =>
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
          ).catch((): SearchStrategyResult => ({
            intent: { category },
            queries: [],
            unresolvedBrands: [],
            resolvedBrands: [],
            fetched: 0,
            duplicatesRemoved: 0,
            hardFiltered: 0,
            filterReasons: { search_failed: 1 },
            candidates: [],
          })),
        ),
      ),
      timeoutMs,
    );

    const merged = new Map<string, CatalogProduct>();
    let fetched = 0;
    let queryCount = 0;
    const unresolved = new Set<string>();
    for (const result of results) {
      fetched += result.fetched;
      queryCount += result.queries.length;
      for (const name of result.unresolvedBrands) unresolved.add(name);
      for (const candidate of result.candidates) {
        const product = catalogProductFromNormalized(candidate.product);
        if (!matchesGenderPreference(product, input.gender)) continue;
        merged.set(product.id, product);
      }
    }

    const products = [...merged.values()];
    const complete = {
      attempted: true,
      ok: products.length > 0,
      reason: products.length ? null : 'empty',
      products,
      fetched,
      queryCount,
      usable: products.length,
      categories: countByCategory(products),
      unresolvedBrands: [...unresolved],
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
      })}`,
    );
    return complete;
  } catch (err) {
    const reason = err instanceof Error && err.message === 'timeout' ? 'timeout' : 'error';
    console.log(
      `[CHANNEL3_LIVE] retrieval complete ${JSON.stringify({
        used: false,
        query_count: 0,
        fetched: 0,
        usable: 0,
        reason,
      })}`,
    );
    return {
      attempted: true,
      ok: false,
      reason,
      products: [],
      fetched: 0,
      queryCount: 0,
      usable: 0,
      categories: countByCategory([]),
      unresolvedBrands: [],
    };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
