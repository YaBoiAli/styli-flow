import type { CatalogProduct, CatalogResult, ProductCategory } from './catalog.ts';
import { isFootwearProduct } from './footwearPreference.ts';
import {
  type Channel3Reason,
  emptyMetadataStats,
  mapLegacyChannel3Reason,
} from './genTrace.ts';
import {
  LIVE_REQUIRED_CATEGORIES,
  type LiveRetrieval,
  type LiveRetrievalSource,
  countByCategory,
  missingRequiredCategories,
} from './liveRetrieval.ts';

export type ResolvedGenerationCatalog = {
  products: CatalogProduct[];
  retrievalSource: LiveRetrievalSource;
  channel3Attempted: boolean;
  catalogOrigin: 'live' | 'demo' | null;
  unavailableBrands: string[];
  fallbackReason: string | null;
  live: LiveRetrieval | null;
};

export function mergeCatalogProducts(
  live: CatalogProduct[],
  stored: CatalogProduct[],
): CatalogProduct[] {
  const merged = new Map<string, CatalogProduct>();
  for (const product of live) merged.set(product.id, product);
  for (const product of stored) {
    if (!merged.has(product.id)) merged.set(product.id, product);
  }
  return [...merged.values()];
}

export function logLiveRetrieval(live: LiveRetrieval): void {
  console.log(
    `[CHANNEL3_LIVE] ${JSON.stringify({
      used: live.ok,
      query_count: live.queryCount,
      fetched: live.fetched,
      usable: live.usable,
      categories: live.categories,
      unresolved_brands: live.unresolvedBrands,
      reason: live.reason,
    })}`,
  );
}

export function logLiveFallback(reason: string, extra: Record<string, unknown> = {}): void {
  console.log(`[CHANNEL3_FALLBACK] ${JSON.stringify({ reason, ...extra })}`);
}

/**
 * LIVE FIRST → fill missing required categories from the existing catalog.
 * retrieveLive is invoked at most once. loadStored is skipped when live is sufficient.
 */
export async function resolveGenerationCatalog(input: {
  retrieveLive: () => Promise<LiveRetrieval>;
  loadStored: () => Promise<CatalogResult>;
  isSufficient: (products: CatalogProduct[]) => boolean;
  required?: ProductCategory[];
  excludeCategories?: ProductCategory[];
}): Promise<ResolvedGenerationCatalog> {
  const required = input.required ?? LIVE_REQUIRED_CATEGORIES;
  const exclude = new Set(input.excludeCategories ?? []);
  const dropFootwear = exclude.has('shoes');
  const withoutExcluded = (products: CatalogProduct[]) => {
    const next = exclude.size
      ? products.filter((product) => !exclude.has(product.category))
      : products;
    return dropFootwear ? next.filter((product) => !isFootwearProduct(product)) : next;
  };
  const live = await input.retrieveLive();
  if (live.attempted) logLiveRetrieval(live);
  const liveProducts = withoutExcluded(live.products);

  if (live.ok && input.isSufficient(liveProducts)) {
    return {
      products: liveProducts,
      retrievalSource: 'channel3_live',
      channel3Attempted: true,
      catalogOrigin: null,
      unavailableBrands: live.unresolvedBrands,
      fallbackReason: null,
      live,
    };
  }

  const stored = await input.loadStored();
  if (!stored.ok) {
    logLiveFallback(live.attempted ? live.reason ?? 'stored_catalog_failed' : 'no_channel3_key', {
      stored: stored.code,
    });
    return {
      products: liveProducts,
      retrievalSource: liveProducts.length ? 'channel3_live' : 'catalog_fallback',
      channel3Attempted: live.attempted,
      catalogOrigin: null,
      unavailableBrands: stored.unavailableBrands,
      fallbackReason: stored.code,
      live,
    };
  }

  const storedProducts = withoutExcluded(stored.products);
  const liveMissing = missingRequiredCategories(liveProducts, required);
  const reason =
    !live.attempted
      ? 'no_api_key'
      : !live.ok
        ? live.reason ?? 'empty_results'
        : liveMissing.length
          ? live.reason === 'partial_results' || live.timedOut
            ? 'partial_results'
            : `missing_${liveMissing.join('_')}`
          : 'insufficient_core_outfit';

  const products =
    live.ok && liveProducts.length
      ? mergeCatalogProducts(liveProducts, storedProducts)
      : storedProducts;
  const usedLive = live.ok && liveProducts.length > 0;
  const retrievalSource: LiveRetrievalSource = usedLive ? 'hybrid' : 'catalog_fallback';
  logLiveFallback(reason, {
    source: retrievalSource,
    live_categories: live.categories,
    stored_count: storedProducts.length,
  });

  return {
    products,
    retrievalSource,
    channel3Attempted: live.attempted,
    catalogOrigin: stored.catalogSource,
    unavailableBrands: [...new Set([...live.unresolvedBrands, ...stored.unavailableBrands])],
    fallbackReason: reason,
    live,
  };
}

export function emptyLiveRetrieval(reason: string): LiveRetrieval {
  const mapped: Channel3Reason = mapLegacyChannel3Reason(reason);
  return {
    attempted: false,
    ok: false,
    reason: mapped,
    products: [],
    fetched: 0,
    queryCount: 0,
    usable: 0,
    categories: countByCategory([]),
    unresolvedBrands: [],
    timedOut: mapped === 'request_timeout',
    metadata: emptyMetadataStats(),
  };
}
