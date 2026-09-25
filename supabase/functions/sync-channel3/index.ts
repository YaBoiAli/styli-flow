import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { Channel3Client, readChannel3ApiKey } from '../_shared/catalog/channel3/client.ts';
import { parseChannel3SyncParams, syncChannel3Catalog } from '../_shared/catalog/channel3/sync.ts';
import { Channel3Error } from '../_shared/catalog/channel3/types.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

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

  const apiKey = readChannel3ApiKey({ get: (name) => Deno.env.get(name) });
  if (!apiKey) {
    return jsonResponse({ error: 'CHANNEL3_API_KEY is not set', reason: 'missing_api_key' }, 500);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const params = parseChannel3SyncParams(body);
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await syncChannel3Catalog(supabase, new Channel3Client(apiKey), params);
    return jsonResponse(result);
  } catch (err) {
    const status = err instanceof Channel3Error && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
    const reason = err instanceof Channel3Error ? err.reason : 'sync_failed';
    console.log(
      `[CHANNEL3_SYNC_ERROR] ${JSON.stringify({
        status,
        reason,
        brands: params.brands ?? [],
        websites: params.websites ?? [],
      })}`,
    );
    return jsonResponse({ error: 'Channel3 sync failed', reason }, status === 401 ? 502 : status);
  }
}

const localPort = Number(Deno.env.get('EDGE_FUNCTION_PORT') ?? '');
if (Number.isFinite(localPort) && localPort > 0) {
  Deno.serve({ port: localPort, hostname: '127.0.0.1' }, handler);
} else {
  Deno.serve(handler);
}
