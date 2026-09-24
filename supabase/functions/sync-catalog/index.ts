import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { BRAND_COLUMNS, type BrandRow, type SyncOutcome, syncBrand } from '../_shared/catalog/ingest.ts';

type DueBrand = BrandRow & { last_synced_at: string | null; updated_at: string };

const HOUR_MS = 60 * 60 * 1000;
/** Runs hourly; a brand is due roughly once a day. */
const SUPPORTED_REFRESH_MS = 20 * HOUR_MS;
const UNSUPPORTED_RECHECK_MS = 7 * 24 * HOUR_MS;
const CHECKING_STALE_MS = 10 * 60 * 1000;
/** Stop starting new brands after this, leaving headroom under the Edge Function wall clock. */
const TIME_BUDGET_MS = 90 * 1000;
const SYNC_MAX_REQUESTS = 60;
const MAX_BRANDS_PER_RUN = 25;

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function authorized(req: Request, serviceKey: string): boolean {
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (bearer && safeEqual(bearer, serviceKey)) return true;
  const secret = Deno.env.get('CATALOG_SYNC_SECRET');
  const provided = req.headers.get('x-sync-secret') ?? '';
  return Boolean(secret && provided && safeEqual(provided, secret));
}

export function isDue(brand: DueBrand, now: number): boolean {
  if (brand.status === 'checking') {
    return now - Date.parse(brand.updated_at) > CHECKING_STALE_MS;
  }
  if (!brand.last_synced_at) return true;
  const age = now - Date.parse(brand.last_synced_at);
  if (brand.status === 'unsupported') return age > UNSUPPORTED_RECHECK_MS;
  return age > SUPPORTED_REFRESH_MS;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: 'Not configured' }, 500);
  if (!authorized(req, serviceKey)) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = (await req.json().catch(() => ({}))) as { domains?: unknown; force?: unknown };
  const onlyDomains = Array.isArray(body.domains)
    ? new Set(body.domains.filter((d): d is string => typeof d === 'string').map((d) => d.toLowerCase()))
    : null;
  const force = body.force === true;

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from('brands')
    .select(`${BRAND_COLUMNS}, last_synced_at, updated_at`)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(1000);
  if (error) return jsonResponse({ error: error.message }, 500);

  const started = Date.now();
  const due = ((data ?? []) as DueBrand[])
    .filter((brand) => !onlyDomains || onlyDomains.has(brand.domain))
    .filter((brand) => force || isDue(brand, started))
    .slice(0, MAX_BRANDS_PER_RUN);

  const results: Array<SyncOutcome & { domain: string }> = [];
  for (const brand of due) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const outcome = await syncBrand(supabase, brand, {
      trigger: onlyDomains || force ? 'manual' : 'sync',
      maxRequests: SYNC_MAX_REQUESTS,
    });
    results.push({ ...outcome, domain: brand.domain });
  }

  return jsonResponse({
    due: due.length,
    synced: results.length,
    remaining: due.length - results.length,
    elapsed_ms: Date.now() - started,
    results,
  });
}

const localPort = Number(Deno.env.get('EDGE_FUNCTION_PORT') ?? '');
if (Number.isFinite(localPort) && localPort > 0) {
  Deno.serve({ port: localPort, hostname: '127.0.0.1' }, handler);
} else {
  Deno.serve(handler);
}
