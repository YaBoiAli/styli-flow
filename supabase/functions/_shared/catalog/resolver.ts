import { affiliateFeedSourceFactory } from './sources/affiliateFeed.ts';
import { directWebsiteSourceFactory } from './sources/directWebsite.ts';
import { externalSearchSourceFactory } from './sources/externalSearch.ts';
import { officialApiSourceFactory } from './sources/officialApi.ts';
import { shopifySourceFactory } from './sources/shopify.ts';
import { structuredDataSourceFactory } from './sources/structuredData.ts';
import type { PoliteFetcher } from './politeFetch.ts';
import {
  AccessDeniedError,
  type BrandInfo,
  type ProductListing,
  type ResolveAttempt,
  type SourceFactory,
  type SourceType,
} from './types.ts';

/** Order the resolver tries sources in; the first one that yields real products wins. */
export const SOURCE_PRIORITY: SourceFactory[] = [
  officialApiSourceFactory,
  affiliateFeedSourceFactory,
  shopifySourceFactory,
  structuredDataSourceFactory,
  directWebsiteSourceFactory,
  externalSearchSourceFactory,
];

/** Sources that read the brand's own website, and therefore stop once the site blocks us. */
const ON_SITE: SourceType[] = ['shopify', 'structured_data', 'direct_website'];
/** Probing Shopify's JSON path on a non-Shopify site can 403 without meaning the whole site refuses us. */
const PATH_PROBE: SourceType[] = ['shopify'];

/** A brand needs at least this many valid, normalized products to count as supported. */
export const MIN_SUPPORTED_PRODUCTS = 3;

export type ResolveResult =
  | { status: 'supported'; source: SourceType; listing: ProductListing; attempts: ResolveAttempt[] }
  | { status: 'unsupported'; reason: string; attempts: ResolveAttempt[] };

export async function resolveBrandProducts(params: {
  brand: BrandInfo;
  fetcher: PoliteFetcher;
  limit: number;
  /** Source that worked last time; tried first so daily refreshes stay cheap. */
  preferred?: SourceType | null;
  now?: () => string;
}): Promise<ResolveResult> {
  const now = params.now ?? (() => new Date().toISOString());
  const order = params.preferred
    ? [
        ...SOURCE_PRIORITY.filter((factory) => factory.type === params.preferred),
        ...SOURCE_PRIORITY.filter((factory) => factory.type !== params.preferred),
      ]
    : SOURCE_PRIORITY;

  const attempts: ResolveAttempt[] = [];
  let siteBlocked: AccessDeniedError | null = null;

  for (const factory of order) {
    if (siteBlocked && ON_SITE.includes(factory.type)) {
      attempts.push({ source: factory.type, outcome: 'skipped', detail: 'site blocked earlier source' });
      continue;
    }
    const source = factory.create({ brand: params.brand, fetcher: params.fetcher, now });
    try {
      if (!(await source.detect())) {
        attempts.push({ source: factory.type, outcome: 'unavailable', detail: 'not available for this brand' });
        continue;
      }
      const listing = await source.listProducts(params.limit);
      if (listing.products.length >= MIN_SUPPORTED_PRODUCTS) {
        attempts.push({
          source: factory.type,
          outcome: 'succeeded',
          detail: `${listing.products.length} products`,
        });
        return { status: 'supported', source: factory.type, listing, attempts };
      }
      attempts.push({
        source: factory.type,
        outcome: 'no_products',
        detail: `only ${listing.products.length} usable products`,
      });
    } catch (err) {
      if (err instanceof AccessDeniedError) {
        if (PATH_PROBE.includes(factory.type) && err.reason !== 'rate_limited') {
          attempts.push({ source: factory.type, outcome: 'unavailable', detail: err.message });
          continue;
        }
        attempts.push({ source: factory.type, outcome: 'blocked', detail: err.message });
        if (ON_SITE.includes(factory.type)) siteBlocked = err;
        continue;
      }
      attempts.push({
        source: factory.type,
        outcome: 'error',
        detail: err instanceof Error ? err.message.slice(0, 200) : 'unknown error',
      });
    }
  }

  return { status: 'unsupported', reason: unsupportedReason(attempts, siteBlocked), attempts };
}

function unsupportedReason(attempts: ResolveAttempt[], blocked: AccessDeniedError | null): string {
  if (blocked?.reason === 'robots') {
    return "This store doesn't allow automated catalog indexing.";
  }
  if (blocked) {
    return "This store blocks automated access, so we can't read its catalog yet.";
  }
  if (attempts.some((attempt) => attempt.outcome === 'no_products')) {
    return "We couldn't find enough clothing with prices and photos on this store.";
  }
  return "We couldn't find a public product catalog for this store yet.";
}
