import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import {
  BRAND_COLUMNS,
  type BrandRow,
  countFreshProducts,
  dedupeNormalizedProducts,
  upsertNormalizedProducts,
} from '../ingest.ts';
import {
  type EnrichableProduct,
  enrichProductRowWithRetry,
  loadEnrichableProduct,
  PRODUCT_ENRICH_COLUMNS,
} from '../enrichProduct.ts';
import type { NormalizedProduct, ProductCategory, ProductGender } from '../types.ts';
import { createChannel3SearchBackend } from '../searchStrategy/channel3Backend.ts';
import { runSearchStrategy } from '../searchStrategy/run.ts';
import { Channel3Client } from './client.ts';
import { Channel3Error } from './types.ts';
import {
  CHANNEL3_SOURCE,
  normalizeChannel3Product,
  normalizeDomain,
  pickBrandMatch,
  type NormalizeSkipReason,
} from './normalize.ts';
import {
  buildChannel3Filters,
  buildChannel3Query,
  readStringList,
  type Channel3SearchIntent,
} from './query.ts';

export const CHANNEL3_SYNC_MAX = 50;
export const CHANNEL3_SYNC_DEFAULT = 40;

export type Channel3SyncParams = Channel3SearchIntent & {
  brand?: string;
  website?: string;
  limit?: number;
  enrich?: boolean;
  occasion?: string;
  gender?: ProductGender;
  budget?: number;
  shoeBudget?: number | null;
};

export type Channel3SyncResult = {
  source: 'channel3';
  query: string | null;
  brands: string[];
  websites: string[];
  category: ProductCategory | null;
  style: string | null;
  channel3_brand_ids: string[];
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  enriched: number;
  skip_reasons: Partial<Record<NormalizeSkipReason | string, number>>;
};

type NormalizedRow = {
  product: NormalizedProduct;
  offerDomain: string;
  channel3BrandName: string;
};

export function clampChannel3Limit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return CHANNEL3_SYNC_DEFAULT;
  return Math.min(CHANNEL3_SYNC_MAX, Math.max(1, Math.floor(value)));
}

export function parseChannel3SyncParams(body: Record<string, unknown>): Channel3SyncParams {
  const brands = readStringList(body.brands ?? body.brand);
  const websites = readStringList(body.websites ?? body.website);
  const category = body.category;
  return {
    query: typeof body.query === 'string' ? body.query : undefined,
    style: typeof body.style === 'string' ? body.style : undefined,
    category:
      category === 'top' ||
      category === 'bottom' ||
      category === 'shoes' ||
      category === 'outerwear' ||
      category === 'accessory'
        ? category
        : undefined,
    brands,
    websites,
    page_token: typeof body.page_token === 'string' ? body.page_token : undefined,
    limit: typeof body.limit === 'number' ? body.limit : undefined,
    enrich: body.enrich === false ? false : true,
    occasion: typeof body.occasion === 'string' ? body.occasion : undefined,
    gender:
      body.gender === 'men' || body.gender === 'women' || body.gender === 'unisex'
        ? body.gender
        : undefined,
    budget: typeof body.budget === 'number' ? body.budget : undefined,
    shoeBudget: typeof body.shoe_budget === 'number' ? body.shoe_budget : undefined,
  };
}

export async function resolveChannel3Brands(
  client: Channel3Client,
  names: string[],
): Promise<Array<{ id: string; name: string }>> {
  const resolved: Array<{ id: string; name: string }> = [];
  for (const name of names) {
    const result = await client.searchBrands(name, 8);
    const match = pickBrandMatch(result.brands, name);
    if (!match) {
      throw new Channel3Error(`Channel3 has no brand matching ${name}`, 404, 'brand_not_found');
    }
    resolved.push(match);
  }
  return resolved;
}

export async function fetchChannel3Products(
  client: Channel3Client,
  params: {
    query: string;
    brandIds?: string[];
    websites?: string[];
    limit: number;
    pageToken?: string;
  },
): Promise<Awaited<ReturnType<Channel3Client['searchPages']>>['products']> {
  const { products } = await client.searchPages({
    query: params.query,
    filters: buildChannel3Filters({
      brandIds: params.brandIds,
      websites: params.websites,
    }),
    limit: params.limit,
    maxPages: 3,
    pageToken: params.pageToken,
  });
  return products;
}

export async function syncChannel3Catalog(
  supabase: SupabaseClient,
  client: Channel3Client,
  params: Channel3SyncParams = {},
): Promise<Channel3SyncResult> {
  const brands = params.brands?.length
    ? params.brands
    : params.brand?.trim()
      ? [params.brand.trim()]
      : [];
  const websites = params.websites?.length
    ? params.websites
    : params.website?.trim()
      ? [params.website.trim()]
      : [];
  const intent: Channel3SearchIntent = {
    query: params.query,
    style: params.style,
    category: params.category,
    brands,
    websites,
    page_token: params.page_token,
  };
  const useStrategy = usesStyliSearchStrategy(params);
  const query = buildChannel3Query(intent);
  if (!useStrategy && !query && !params.page_token) {
    throw new Channel3Error(
      'Provide query, style, category, brand, or website',
      400,
      'missing_query',
    );
  }

  const limit = clampChannel3Limit(params.limit);
  const now = new Date().toISOString();
  const requestedDomains = new Set(
    websites.map((site) => normalizeDomain(site)).filter((site): site is string => Boolean(site)),
  );

  let searchQuery = query ?? null;
  let resolvedBrands: Array<{ id: string; name: string }> = [];
  let rawFetched = 0;
  const skipReasons: Channel3SyncResult['skip_reasons'] = {};
  let uniqueRows: NormalizedRow[] = [];

  if (useStrategy) {
    try {
      const strategy = await runSearchStrategy(
        {
          style: params.style,
          category: params.category,
          occasion: params.occasion,
          gender: params.gender,
          budget: params.budget,
          shoeBudget: params.shoeBudget,
          brands,
          websites,
        },
        createChannel3SearchBackend(client, { preferredWebsites: websites }),
        {
          perQueryLimit: 12,
          maxQueries: 12,
          candidatePool: 80,
          finalCandidates: Math.max(limit, 24),
        },
      );
      searchQuery = strategy.queries.map((entry) => entry.text).join(' | ') || searchQuery;
      resolvedBrands = strategy.resolvedBrands;
      rawFetched = strategy.fetched;
      Object.assign(skipReasons, strategy.filterReasons);
      uniqueRows = strategy.candidates.map((candidate) => ({
        product: candidate.product,
        offerDomain: domainFromProductUrl(candidate.product.product_url),
        channel3BrandName: candidate.product.brand,
      }));
    } catch (err) {
      logSyncError(err, { query: searchQuery, brands, websites });
      throw err;
    }
  } else {
    resolvedBrands = brands.length ? await resolveChannel3Brands(client, brands) : [];
    let rawProducts: Awaited<ReturnType<typeof fetchChannel3Products>> = [];
    try {
      rawProducts = await fetchChannel3Products(client, {
        query: query ?? 'clothing',
        brandIds: resolvedBrands.map((brand) => brand.id),
        websites,
        limit,
        pageToken: params.page_token,
      });
    } catch (err) {
      logSyncError(err, { query, brands, websites });
      throw err;
    }
    rawFetched = rawProducts.length;
    const rows: NormalizedRow[] = [];
    for (const raw of rawProducts) {
      const result = normalizeChannel3Product(raw, {
        now,
        preferredWebsites: websites,
        fallbackBrand: resolvedBrands[0]?.name,
      });
      if (!result.ok) {
        skipReasons[result.reason] = (skipReasons[result.reason] ?? 0) + 1;
        continue;
      }
      rows.push(result);
    }
    uniqueRows = uniqueNormalizedRows(rows);
  }

  const requestedBrandNames = new Set(
    [...brands, ...resolvedBrands.map((brand) => brand.name)].map((name) => name.toLowerCase()),
  );
  const existingIds = await existingChannel3Ids(
    supabase,
    uniqueRows.map((row) => row.product.source_product_id),
  );

  let inserted = 0;
  let updated = 0;
  const grouped = groupByBrand(uniqueRows);
  for (const group of grouped) {
    const approve =
      requestedBrandNames.has(group.name.toLowerCase()) ||
      requestedDomains.has(group.domain);
    const brand = await ensureStyliBrand(supabase, {
      name: group.name,
      domain: group.domain,
      approve,
    });
    const products = group.products;
    const upserted = await upsertNormalizedProducts(supabase, brand, products);
    const groupUpdated = products.filter((product) => existingIds.has(product.source_product_id)).length;
    updated += groupUpdated;
    inserted += upserted - groupUpdated;
    const productCount = await countFreshProducts(supabase, brand.id);
    await supabase
      .from('brands')
      .update({
        status: productCount > 0 ? 'supported' : brand.status,
        source_type: CHANNEL3_SOURCE,
        product_count: productCount,
        last_synced_at: now,
        last_sync_status: 'succeeded',
        last_sync_error: null,
        unsupported_reason: null,
        updated_at: now,
      })
      .eq('id', brand.id);
  }

  let enriched = 0;
  if (params.enrich !== false && uniqueRows.length) {
    enriched = await enrichChannel3Batch(
      supabase,
      uniqueRows.map((row) => row.product.source_product_id),
    );
  }

  const result: Channel3SyncResult = {
    source: 'channel3',
    query: searchQuery,
    brands,
    websites,
    category: params.category ?? null,
    style: params.style ?? null,
    channel3_brand_ids: resolvedBrands.map((brand) => brand.id),
    fetched: rawFetched,
    inserted,
    updated,
    skipped: Math.max(0, rawFetched - uniqueRows.length),
    enriched,
    skip_reasons: skipReasons,
  };
  console.log(`[CHANNEL3_SYNC] ${JSON.stringify(result)}`);
  return result;
}

function usesStyliSearchStrategy(params: Channel3SyncParams): boolean {
  return Boolean((params.style || params.occasion || params.category) && !params.query && !params.page_token);
}

function domainFromProductUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '') || 'unknown';
  } catch {
    return 'unknown';
  }
}

function uniqueNormalizedRows(rows: NormalizedRow[]): NormalizedRow[] {
  const products = dedupeNormalizedProducts(rows.map((row) => row.product));
  const byId = new Map(rows.map((row) => [row.product.source_product_id, row]));
  return products.map((product) => byId.get(product.source_product_id)!);
}

function groupByBrand(rows: NormalizedRow[]): Array<{
  name: string;
  domain: string;
  products: NormalizedProduct[];
}> {
  const groups = new Map<string, { name: string; domain: string; products: NormalizedProduct[] }>();
  for (const row of rows) {
    const key = `${row.channel3BrandName.toLowerCase()}|${row.offerDomain}`;
    const existing = groups.get(key);
    if (existing) {
      existing.products.push(row.product);
      continue;
    }
    groups.set(key, {
      name: row.channel3BrandName,
      domain: row.offerDomain,
      products: [row.product],
    });
  }
  return [...groups.values()];
}

async function ensureStyliBrand(
  supabase: SupabaseClient,
  input: { name: string; domain: string; approve: boolean },
): Promise<BrandRow> {
  const domain = normalizeDomain(input.domain) ?? input.domain.toLowerCase();
  const columns = `${BRAND_COLUMNS}, is_approved`;
  const { data: byDomain, error } = await supabase
    .from('brands')
    .select(columns)
    .eq('domain', domain)
    .maybeSingle();
  if (error) throw new Error(`brand lookup failed: ${error.message}`);
  if (byDomain) {
    if (input.approve && byDomain.is_approved === false) {
      await supabase
        .from('brands')
        .update({ is_approved: true, updated_at: new Date().toISOString() })
        .eq('id', byDomain.id);
    }
    return byDomain as BrandRow;
  }

  const { data: byName } = await supabase
    .from('brands')
    .select(columns)
    .ilike('name', input.name)
    .limit(1)
    .maybeSingle();
  if (byName) return byName as BrandRow;

  const { data, error: insertError } = await supabase
    .from('brands')
    .insert({
      name: input.name,
      domain,
      is_approved: input.approve,
      status: 'pending',
      source_type: CHANNEL3_SOURCE,
      source_config: { provider: 'channel3' },
    })
    .select(BRAND_COLUMNS)
    .single();
  if (insertError || !data) throw new Error(`brand insert failed: ${insertError?.message ?? 'unknown'}`);
  return data as BrandRow;
}

async function existingChannel3Ids(
  supabase: SupabaseClient,
  sourceProductIds: string[],
): Promise<Set<string>> {
  if (!sourceProductIds.length) return new Set();
  const { data, error } = await supabase
    .from('products')
    .select('source_product_id')
    .eq('source', CHANNEL3_SOURCE)
    .in('source_product_id', sourceProductIds);
  if (error) throw new Error(`existing product lookup failed: ${error.message}`);
  return new Set((data ?? []).map((row) => row.source_product_id as string));
}

async function enrichChannel3Batch(
  supabase: SupabaseClient,
  sourceProductIds: string[],
): Promise<number> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_ENRICH_COLUMNS)
    .eq('source', CHANNEL3_SOURCE)
    .in('source_product_id', sourceProductIds);
  if (error || !data) return 0;
  let enriched = 0;
  for (const row of data) {
    const loaded = await loadEnrichableProduct(supabase, row.id as string);
    const product = (loaded ?? row) as EnrichableProduct;
    const outcome = await enrichProductRowWithRetry(supabase, product, { retries: 1 });
    if (outcome.ok) enriched += 1;
  }
  return enriched;
}

function logSyncError(err: unknown, context: { query: string | null; brands: string[]; websites: string[] }): void {
  console.log(
    `[CHANNEL3_SYNC_ERROR] ${JSON.stringify({
      query: context.query,
      brands: context.brands,
      websites: context.websites,
      status: err instanceof Channel3Error ? err.status : 0,
      reason: err instanceof Channel3Error ? err.reason : 'query_failed',
    })}`,
  );
}
