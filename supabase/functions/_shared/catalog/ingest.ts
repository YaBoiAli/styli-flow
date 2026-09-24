import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { freshSince } from './freshness.ts';
import { PoliteFetcher } from './politeFetch.ts';
import { MIN_SUPPORTED_PRODUCTS, resolveBrandProducts } from './resolver.ts';
import type { NormalizedProduct, ResolveAttempt, SourceType } from './types.ts';

export type BrandRow = {
  id: string;
  name: string;
  domain: string;
  status: 'pending' | 'checking' | 'supported' | 'unsupported' | 'error';
  source_type: SourceType | null;
  source_config: Record<string, unknown> | null;
  product_count: number;
};

export type SyncTrigger = 'resolve' | 'sync' | 'manual';

export type SyncOutcome = {
  brand_id: string;
  status: BrandRow['status'];
  source_type: SourceType | null;
  product_count: number;
  reason: string | null;
};

const UPSERT_CHUNK = 200;
const CATALOG_LIMIT = 1000;

export const BRAND_COLUMNS =
  'id, name, domain, status, source_type, source_config, product_count';

export { FRESHNESS_DAYS, freshSince } from './freshness.ts';

/**
 * Pulls a brand's catalog through the resolver and stores it. The brand only becomes
 * `supported` when real products were retrieved, normalized and saved.
 */
export async function syncBrand(
  supabase: SupabaseClient,
  brand: BrandRow,
  options: { trigger: SyncTrigger; maxRequests: number },
): Promise<SyncOutcome> {
  const runStart = new Date().toISOString();
  const { data: run } = await supabase
    .from('ingestion_runs')
    .insert({ brand_id: brand.id, trigger: options.trigger, started_at: runStart })
    .select('id')
    .single();
  const runId: string | null = run?.id ?? null;

  if (brand.status !== 'supported') {
    await supabase
      .from('brands')
      .update({ status: 'checking', updated_at: runStart })
      .eq('id', brand.id);
  }

  let attempts: ResolveAttempt[] = [];
  let sourceType: SourceType | null = null;
  let found = 0;
  let upserted = 0;
  let markedUnavailable = 0;

  try {
    const fetcher = new PoliteFetcher({ maxRequests: options.maxRequests });
    const origin = await fetcher.canonicalOrigin(brand.domain);
    const result = await resolveBrandProducts({
      brand: {
        id: brand.id,
        name: brand.name,
        domain: brand.domain,
        origin,
        sourceConfig: brand.source_config ?? {},
      },
      fetcher,
      limit: CATALOG_LIMIT,
      preferred: brand.source_type,
      now: () => runStart,
    });
    attempts = result.attempts;

    if (result.status === 'supported') {
      sourceType = result.source;
      const products = dedupe(result.listing.products);
      found = products.length;
      upserted = await upsertProducts(supabase, brand, products);
      if (result.listing.complete) {
        markedUnavailable = await markMissingDiscontinued(supabase, brand.id, runStart);
      }
    }

    const productCount = await countFreshProducts(supabase, brand.id);
    const outcome = await finishBrand(supabase, brand, {
      succeeded: result.status === 'supported' && productCount >= MIN_SUPPORTED_PRODUCTS,
      sourceType,
      productCount,
      reason: result.status === 'unsupported'
        ? result.reason
        : "We couldn't find enough clothing in stock on this store.",
      failureStatus: 'unsupported',
    });
    await finishRun(supabase, runId, {
      status: result.status === 'supported' ? 'succeeded' : 'failed',
      source_type: sourceType,
      products_found: found,
      products_upserted: upserted,
      products_marked_unavailable: markedUnavailable,
      attempts,
      error: result.status === 'unsupported' ? result.reason : null,
    });
    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : 'unknown error';
    console.error('syncBrand failed', brand.domain, message);
    const productCount = await countFreshProducts(supabase, brand.id).catch(() => 0);
    const outcome = await finishBrand(supabase, brand, {
      succeeded: false,
      sourceType,
      productCount,
      reason: "We couldn't check this store right now. We'll try again later.",
      failureStatus: 'error',
      error: message,
    });
    await finishRun(supabase, runId, {
      status: 'failed',
      source_type: sourceType,
      products_found: found,
      products_upserted: upserted,
      products_marked_unavailable: markedUnavailable,
      attempts,
      error: message,
    });
    return outcome;
  }
}

function dedupe(products: NormalizedProduct[]): NormalizedProduct[] {
  const byId = new Map<string, NormalizedProduct>();
  for (const product of products) byId.set(`${product.source}|${product.source_product_id}`, product);
  return [...byId.values()];
}

async function upsertProducts(
  supabase: SupabaseClient,
  brand: BrandRow,
  products: NormalizedProduct[],
): Promise<number> {
  let count = 0;
  for (let i = 0; i < products.length; i += UPSERT_CHUNK) {
    const rows = products.slice(i, i + UPSERT_CHUNK).map((product) => ({
      brand_id: brand.id,
      name: product.product_name,
      // The store the user picked, not the feed's vendor label (licensees, sub-lines).
      brand: brand.name,
      description: product.description,
      category: product.category,
      subcategory: product.subcategory,
      price: product.price,
      currency: product.currency,
      color: product.colors[0] ?? 'Assorted',
      colors: product.colors,
      sizes: product.sizes,
      material: product.material,
      gender: product.gender,
      availability: product.availability,
      image_url: product.image_url,
      purchase_url: product.product_url,
      style_tags: [],
      occasion_tags: [],
      source: product.source,
      source_product_id: product.source_product_id,
      last_checked: product.last_checked,
      updated_at: product.last_checked,
    }));
    const { error } = await supabase
      .from('products')
      .upsert(rows, { onConflict: 'source,source_product_id' });
    if (error) throw new Error(`product upsert failed: ${error.message}`);
    count += rows.length;
  }
  return count;
}

/** Only called after a complete catalog read, so anything not seen this run is gone. */
async function markMissingDiscontinued(
  supabase: SupabaseClient,
  brandId: string,
  runStart: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('products')
    .update({ availability: 'discontinued', updated_at: runStart })
    .eq('brand_id', brandId)
    .neq('source', 'demo')
    .neq('availability', 'discontinued')
    .lt('last_checked', runStart)
    .select('id');
  if (error) throw new Error(`discontinue update failed: ${error.message}`);
  return data?.length ?? 0;
}

export async function countFreshProducts(
  supabase: SupabaseClient,
  brandId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .neq('source', 'demo')
    .in('availability', ['in_stock', 'unknown'])
    .gte('last_checked', freshSince());
  if (error) throw new Error(`product count failed: ${error.message}`);
  return count ?? 0;
}

async function finishBrand(
  supabase: SupabaseClient,
  brand: BrandRow,
  result: {
    succeeded: boolean;
    sourceType: SourceType | null;
    productCount: number;
    reason: string | null;
    failureStatus: 'unsupported' | 'error';
    error?: string;
  },
): Promise<SyncOutcome> {
  const now = new Date().toISOString();
  // A failed refresh doesn't hide a brand whose recent products are still valid.
  const stillSupported =
    !result.succeeded &&
    brand.status === 'supported' &&
    result.productCount >= MIN_SUPPORTED_PRODUCTS;
  const status: BrandRow['status'] =
    result.succeeded || stillSupported ? 'supported' : result.failureStatus;
  const sourceType = result.succeeded ? result.sourceType : brand.source_type;

  const { error } = await supabase
    .from('brands')
    .update({
      status,
      source_type: sourceType,
      unsupported_reason: status === 'supported' ? null : result.reason,
      product_count: result.productCount,
      last_synced_at: now,
      last_sync_status: result.succeeded ? 'succeeded' : 'failed',
      last_sync_error: result.succeeded ? null : (result.error ?? result.reason),
      updated_at: now,
    })
    .eq('id', brand.id);
  if (error) console.error('brand status update failed', brand.domain, error.message);

  return {
    brand_id: brand.id,
    status,
    source_type: sourceType,
    product_count: result.productCount,
    reason: status === 'supported' ? null : result.reason,
  };
}

async function finishRun(
  supabase: SupabaseClient,
  runId: string | null,
  fields: Record<string, unknown>,
): Promise<void> {
  if (!runId) return;
  const { error } = await supabase
    .from('ingestion_runs')
    .update({ ...fields, finished_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) console.error('ingestion run update failed', error.message);
}
