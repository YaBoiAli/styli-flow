import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  type EnrichableProduct,
  type EnrichOutcome,
  enrichProductRowWithRetry,
  sleep,
} from '../_shared/catalog/enrichProduct.ts';
import { ENRICHMENT_VERSION } from '../_shared/catalog/fashionAttributes.ts';

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

function batchSize(): number {
  const raw = Number(Deno.env.get('ENRICH_BATCH_SIZE') ?? '10');
  return Number.isFinite(raw) ? Math.min(50, Math.max(1, Math.floor(raw))) : 10;
}

function delayMs(): number {
  const raw = Number(Deno.env.get('ENRICH_DELAY_MS') ?? '400');
  return Number.isFinite(raw) ? Math.min(5_000, Math.max(0, Math.floor(raw))) : 400;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('EXPO_PUBLIC_SUPABASE_URL');
  const serviceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: 'Not configured' }, 500);
  if (!authorized(req, serviceKey)) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = (await req.json().catch(() => ({}))) as { limit?: unknown };
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? Math.min(50, Math.max(1, Math.floor(body.limit)))
      : batchSize();

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('products_due_for_enrichment', {
    p_version: ENRICHMENT_VERSION,
    p_limit: limit,
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  const due = ((data ?? []) as unknown as EnrichableProduct[]).map((row) => ({
    ...row,
    style_tags: Array.isArray(row.style_tags) ? row.style_tags : [],
    occasion_tags: Array.isArray(row.occasion_tags) ? row.occasion_tags : [],
  }));

  const results: EnrichOutcome[] = [];
  const wait = delayMs();
  for (const [index, product] of due.entries()) {
    const outcome = await enrichProductRowWithRetry(supabase, product);
    results.push(outcome);
    console.log(
      outcome.ok
        ? `enrich ok ${product.id} image=${outcome.used_image}`
        : `enrich fail ${product.id} ${outcome.error}`,
    );
    if (!outcome.ok && outcome.retryable && outcome.error === 'ai_rate_limited') {
      await sleep(Math.max(wait, 2000) * 2);
    }
    if (index < due.length - 1 && wait > 0) await sleep(wait);
  }

  const succeeded = results.filter((row) => row.ok).length;
  const failed = results.length - succeeded;
  return jsonResponse({
    enrichment_version: ENRICHMENT_VERSION,
    due: due.length,
    succeeded,
    failed,
    results,
  });
}

const localPort = Number(Deno.env.get('EDGE_FUNCTION_PORT') ?? '');
if (Number.isFinite(localPort) && localPort > 0) {
  Deno.serve({ port: localPort, hostname: '127.0.0.1' }, handler);
} else {
  Deno.serve(handler);
}
