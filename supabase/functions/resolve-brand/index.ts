import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { BRAND_COLUMNS, type BrandRow, syncBrand } from '../_shared/catalog/ingest.ts';
import { normalizeDomain } from '../_shared/catalog/domain.ts';

type ResolveRequest = {
  name?: unknown;
  website?: unknown;
  request_id?: unknown;
};

type StoredBrand = BrandRow & {
  is_approved: boolean;
  unsupported_reason: string | null;
  last_synced_at: string | null;
  updated_at: string;
};

const HOUR_MS = 60 * 60 * 1000;
const CACHE_MS = 24 * HOUR_MS;
const CHECKING_STALE_MS = 10 * 60 * 1000;
const USER_NEW_BRANDS_PER_HOUR = 5;
const ANON_NEW_BRANDS_PER_HOUR = 30;
/** Keeps an interactive check under about a minute at one request per second. */
const RESOLVE_MAX_REQUESTS = 45;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function brandResponse(brand: StoredBrand | BrandRow, extra: { reason: string | null }) {
  return jsonResponse({
    brand_id: brand.id,
    name: brand.name,
    domain: brand.domain,
    status: brand.status,
    product_count: brand.product_count,
    reason: brand.status === 'supported' ? null : extra.reason,
  });
}

async function userIdFrom(req: Request, supabase: SupabaseClient): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  return data.user?.id ?? null;
}

async function withinRateLimit(supabase: SupabaseClient, userId: string | null): Promise<boolean> {
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  let query = supabase
    .from('brands')
    .select('id', { count: 'exact', head: true })
    .eq('is_approved', false)
    .gte('created_at', since);
  query = userId ? query.eq('created_by', userId) : query.is('created_by', null);
  const { count, error } = await query;
  if (error) return false;
  return (count ?? 0) < (userId ? USER_NEW_BRANDS_PER_HOUR : ANON_NEW_BRANDS_PER_HOUR);
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as ResolveRequest;
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const domain = typeof body.website === 'string' ? normalizeDomain(body.website) : null;
    const requestId =
      typeof body.request_id === 'string' && UUID.test(body.request_id) ? body.request_id : null;
    if (!name || !domain) {
      return jsonResponse({ error: 'Enter a brand name and a valid website.', code: 'invalid' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Brand checks are unavailable right now.', code: 'network' }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userId = await userIdFrom(req, supabase);

    const { data: existing, error: lookupError } = await supabase
      .from('brands')
      .select(`${BRAND_COLUMNS}, is_approved, unsupported_reason, last_synced_at, updated_at`)
      .eq('domain', domain)
      .maybeSingle<StoredBrand>();
    if (lookupError) {
      return jsonResponse({ error: 'Brand checks are unavailable right now.', code: 'network' }, 500);
    }

    let brand = existing;
    if (brand) {
      await linkRequest(supabase, requestId, userId, brand.id);
      const now = Date.now();
      const checking =
        brand.status === 'checking' && now - Date.parse(brand.updated_at) < CHECKING_STALE_MS;
      const recentlySynced =
        (brand.status === 'supported' || brand.status === 'unsupported') &&
        brand.last_synced_at !== null &&
        now - Date.parse(brand.last_synced_at) < CACHE_MS;
      if (checking || recentlySynced) {
        return brandResponse(brand, { reason: brand.unsupported_reason });
      }
    } else {
      if (!(await withinRateLimit(supabase, userId))) {
        return jsonResponse(
          { error: 'Too many new brands right now. Try again in a little while.', code: 'rate_limited' },
          429,
        );
      }
      const { data: inserted, error: insertError } = await supabase
        .from('brands')
        .insert({ name, domain, is_approved: false, created_by: userId })
        .select(`${BRAND_COLUMNS}, is_approved, unsupported_reason, last_synced_at, updated_at`)
        .single<StoredBrand>();
      if (insertError?.code === '23505') {
        // Another request added this domain a moment ago; report its state instead of racing it.
        const { data: raced } = await supabase
          .from('brands')
          .select(`${BRAND_COLUMNS}, unsupported_reason`)
          .eq('domain', domain)
          .maybeSingle<StoredBrand>();
        if (raced) {
          await linkRequest(supabase, requestId, userId, raced.id);
          return brandResponse(raced, { reason: raced.unsupported_reason });
        }
      }
      if (insertError || !inserted) {
        return jsonResponse({ error: 'Brand checks are unavailable right now.', code: 'network' }, 500);
      }
      brand = inserted;
      await linkRequest(supabase, requestId, userId, brand.id);
    }

    const outcome = await syncBrand(supabase, brand, {
      trigger: 'resolve',
      maxRequests: RESOLVE_MAX_REQUESTS,
    });
    return jsonResponse({
      brand_id: outcome.brand_id,
      name: brand.name,
      domain: brand.domain,
      status: outcome.status,
      product_count: outcome.product_count,
      reason: outcome.reason,
    });
  } catch (err) {
    console.error('resolve-brand failed', err instanceof Error ? err.message : err);
    return jsonResponse({ error: 'Brand checks are unavailable right now.', code: 'unknown' }, 500);
  }
}

async function linkRequest(
  supabase: SupabaseClient,
  requestId: string | null,
  userId: string | null,
  brandId: string,
): Promise<void> {
  if (!requestId) return;
  let query = supabase.from('brand_requests').update({ brand_id: brandId }).eq('id', requestId);
  query = userId ? query.eq('user_id', userId) : query.is('user_id', null);
  const { error } = await query;
  if (error) console.error('brand request link failed', error.message);
}

const localPort = Number(Deno.env.get('EDGE_FUNCTION_PORT') ?? '');
if (Number.isFinite(localPort) && localPort > 0) {
  Deno.serve({ port: localPort, hostname: '127.0.0.1' }, handler);
} else {
  Deno.serve(handler);
}
