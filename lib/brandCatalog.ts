import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseUrl } from '@/lib/supabaseUrl';
import type { BrandCatalogStatus } from '@/types';

export type BrandStatus = {
  status: BrandCatalogStatus;
  productCount: number;
};

export type ResolvedBrand = {
  status: BrandCatalogStatus;
  productCount: number;
  reason: string | null;
};

const RESOLVE_TIMEOUT_MS = 90_000;

/**
 * Catalog status of the approved brands, keyed by brand name. Null when the catalog
 * isn't reachable, in which case callers should not gate brand selection.
 */
export async function fetchBrandStatuses(): Promise<Map<string, BrandStatus> | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await getSupabase()
      .from('brands')
      .select('name, status, product_count')
      .eq('is_approved', true);
    if (error || !data) return null;
    return new Map(
      data.map((row) => [
        row.name as string,
        {
          status: row.status as BrandCatalogStatus,
          productCount: Number(row.product_count) || 0,
        },
      ]),
    );
  } catch {
    return null;
  }
}

/**
 * Asks the backend to find and import a brand's real catalog. The brand is only
 * `supported` once products were actually retrieved; this can take up to a minute.
 */
export async function resolveBrand(params: {
  name: string;
  website: string;
  requestId: string;
}): Promise<ResolvedBrand> {
  const unavailable: ResolvedBrand = {
    status: 'error',
    productCount: 0,
    reason: "We couldn't check this store right now. Try again later.",
  };
  const supabaseUrl = getSupabaseUrl();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!isSupabaseConfigured() || !supabaseUrl || !anonKey) return unavailable;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const { data: sessionData } = await getSupabase().auth.getSession();
    const response = await fetch(`${supabaseUrl}/functions/v1/resolve-brand`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session?.access_token ?? anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        name: params.name,
        website: params.website,
        request_id: params.requestId,
      }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as {
      status?: BrandCatalogStatus;
      product_count?: number;
      reason?: string | null;
      error?: string;
    } | null;
    if (!response.ok || !payload?.status) {
      return { ...unavailable, reason: payload?.error ?? unavailable.reason };
    }
    return {
      status: payload.status,
      productCount: Number(payload.product_count) || 0,
      reason: payload.reason ?? null,
    };
  } catch {
    return unavailable;
  } finally {
    clearTimeout(timeout);
  }
}
