/** Editor-only Deno shims. Deno's own checker already provides these types. */

declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): { [key: string]: string };
    has(key: string): boolean;
  }

  const env: Env;

  function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
  function serve(
    options: { port?: number; hostname?: string },
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2.49.1' {
  export { createClient, type SupabaseClient } from '@supabase/supabase-js';
}
