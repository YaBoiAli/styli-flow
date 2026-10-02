import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { handler as runGenerateOutfitHandler } from './generateHandler.ts';

export { handler as handleGenerateOutfit } from './generateHandler.ts';

export async function handler(req: Request): Promise<Response> {
  return runGenerateOutfitHandler(req, {
    env: Deno.env,
    createSupabase: (url, key) =>
      createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
  });
}

const localPort = Number(Deno.env.get('EDGE_FUNCTION_PORT') ?? '');
if (Number.isFinite(localPort) && localPort > 0) {
  Deno.serve({ port: localPort, hostname: '127.0.0.1' }, handler);
} else {
  Deno.serve(handler);
}
