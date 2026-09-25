import type { CatalogProduct, CatalogResult, ProductCategory } from './catalog.ts';
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
}): Promise<ResolvedGenerationCatalog> {
  const required = input.required ?? LIVE_REQUIRED_CATEGORIES;
  const live = await input.retrieveLive();
  if (live.attempted) logLiveRetrieval(live);

  if (live.ok && input.isSufficient(live.products)) {
    return {
      products: live.products,
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
      products: live.products,
      retrievalSource: live.products.length ? 'channel3_live' : 'catalog_fallback',
      channel3Attempted: live.attempted,
      catalogOrigin: null,
      unavailableBrands: stored.unavailableBrands,
      fallbackReason: stored.code,
      live,
    };
  }

  const liveMissing = missingRequiredCategories(live.products, required);
  const reason =
    !live.attempted
      ? 'missing_api_key'
      : !live.ok
        ? live.reason ?? 'empty'
        : liveMissing.length
          ? `missing_${liveMissing.join('_')}`
          : 'insufficient_core_outfit';

  const products =
    live.ok && live.products.length
      ? mergeCatalogProducts(live.products, stored.products)
      : stored.products;
  const usedLive = live.ok && live.products.length > 0;
  const retrievalSource: LiveRetrievalSource = usedLive ? 'hybrid' : 'catalog_fallback';
  logLiveFallback(reason, {
    source: retrievalSource,
    live_categories: live.categories,
    stored_count: stored.products.length,
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
  return {
    attempted: false,
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
