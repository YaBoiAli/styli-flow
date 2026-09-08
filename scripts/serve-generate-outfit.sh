#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/.deno/bin:$PATH"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

export SUPABASE_URL="${SUPABASE_URL:-$EXPO_PUBLIC_SUPABASE_URL}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$EXPO_PUBLIC_SUPABASE_ANON_KEY}"

# Local PostgREST has no real service-role JWT — fall back to anon for catalog reads.
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" || "$SUPABASE_SERVICE_ROLE_KEY" == "your-service-role-key" || "$SUPABASE_SERVICE_ROLE_KEY" == "local-dev-only-not-for-production" ]]; then
  export SUPABASE_SERVICE_ROLE_KEY="$EXPO_PUBLIC_SUPABASE_ANON_KEY"
fi

export ALLOW_HEURISTIC_FALLBACK="${ALLOW_HEURISTIC_FALLBACK:-true}"
export EDGE_FUNCTION_PORT="${EDGE_FUNCTION_PORT:-54331}"

cd "$ROOT/supabase/functions/generate-outfit"
exec deno run --allow-net --allow-env --allow-read index.ts
