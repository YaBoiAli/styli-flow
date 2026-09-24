import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { enrichProductById } from '../_shared/catalog/enrichProduct.ts';

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

  const body = (await req.json().catch(() => ({}))) as { product_id?: unknown };
  const productId = typeof body.product_id === 'string' ? body.product_id.trim() : '';
  if (!productId) return jsonResponse({ error: 'product_id is required' }, 400);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await enrichProductById(supabase, productId);
  if (!result.ok && result.error === 'not_found') {
    return jsonResponse({ error: 'Product not found' }, 404);
  }
  if (!result.ok && result.error === 'ai_missing') {
    return jsonResponse({ error: 'GEMINI_API_KEY is not set' }, 500);
  }
  return jsonResponse(result, result.ok ? 200 : result.retryable ? 503 : 422);
}

const localPort = Number(Deno.env.get('EDGE_FUNCTION_PORT') ?? '');
if (Number.isFinite(localPort) && localPort > 0) {
  Deno.serve({ port: localPort, hostname: '127.0.0.1' }, handler);
} else {
  Deno.serve(handler);
}
