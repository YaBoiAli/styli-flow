# Styli (Vibe)

Your AI stylist, in your pocket.

Gen-Z · Minimal · Premium · Fashion-forward.

## Stack

- React Native + Expo + TypeScript + Expo Router
- Supabase (Postgres, Auth, Edge Functions)
- Gemini (server-side only via Edge Function)
- RevenueCat (subscriptions / `premium` entitlement)

## Stage status

1. Onboarding UI
2. Product catalog
3. AI outfit generation
4. Auth + saved outfits
5. RevenueCat Premium
6. **Final polish**

## Project structure

```text
app/                      # Expo Router screens
  (tabs)/                 # Home · Saved · Profile
  style.tsx / occasion.tsx / budget.tsx
  generation.tsx / outfit.tsx / paywall.tsx
  auth.tsx / saved/[id].tsx
components/               # UI primitives + cards
constants/                # theme + subscription constants
context/                  # Auth, Preferences, Subscription
lib/                      # supabase, generateOutfit, analytics, purchases
supabase/
  migrations/             # Postgres schema
  functions/
    generate-outfit/      # ranks real catalog products (never invents them)
    resolve-brand/        # user-added brand: detect source, import, mark supported
    sync-catalog/         # daily refresh of due brands
    _shared/catalog/      # ProductSource layer (API, affiliate, Shopify, JSON-LD, …)
  cron/schedule_sync_catalog.sql
  seed.sql                # 148 demo products (`source = 'demo'`)
scripts/                  # local proxy, seed, probe-brands, verification
data/                     # product seed JSON
```

## Environment variables

Copy `.env.example` → `.env`:

| Variable | Required | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Project URL or local proxy (`http://127.0.0.1:54321`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon/public key only in the app |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Edge Function / seed scripts |
| `GEMINI_API_KEY` | server | Edge Function only — never ship to the client |
| `GEMINI_MODEL` | optional | defaults to `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODEL` | optional | used when the main model is busy; defaults to `gemini-3.5-flash` |
| `ALLOW_HEURISTIC_FALLBACK` | local | `true` for offline generation without Gemini |
| `ALLOW_DEMO_CATALOG` | local | `true` only in development. Demo rows are never mixed with live products. |
| `CATALOG_BOT_CONTACT` | server | URL or email in the catalog bot User-Agent |
| `CATALOG_SYNC_SECRET` | server | Shared secret for `sync-catalog` (`x-sync-secret` header) |
| `EXTERNAL_PRODUCT_SEARCH_PROVIDER` | optional | Set to `serpapi` to enable the last-resort search source |
| `SERPAPI_API_KEY` | optional | Server-only; used only when the provider above is `serpapi` |
| Affiliate feed env vars | optional | Named in `brands.source_config.affiliate.feed_url_env` (never store the URL or keys in the DB) |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | premium | Test Store `test_…` for development |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | release | `appl_…` |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` | release | `goog_…` |

## Run locally

```bash
cp .env.example .env
npm install

# Local catalog + auth proxy (if using the included local stack)
# PostgREST + scripts/local-supabase-proxy.mjs on :54321
# bash scripts/serve-generate-outfit.sh  # :54331 via proxy

npx expo start --web --port 43123
# or
npm run start
```

### Verification scripts

```bash
npm run test:auth
npm run test:subscription
npm run test:generate   # requires generate-outfit function + catalog
```

## iOS with Expo EAS

RevenueCat needs a **custom Dev Client / EAS build** (not Expo Go).

```bash
npm install -g eas-cli
eas login
eas build:configure

# Development client (Test Store)
eas build --profile development --platform ios

# Production / TestFlight
eas build --profile production --platform ios
eas submit --platform ios
```

Before shipping:

1. Swap RevenueCat Test Store key → `appl_…`

## Product catalog

Gemini never searches the web for clothes. A dedicated source layer finds real products, stores them, and Gemini only ranks IDs from that list.

Sources are tried in this order: official API → affiliate feed → Shopify → public structured data → public product pages → external search. A brand (predefined or custom) is `supported` only after real products were retrieved and normalized. If a store blocks indexing, Styli shows that it isn't available — it never invents a product, price, image, or URL.

```bash
# Probe a store without writing to the database
npx -y deno run --allow-net --allow-env scripts/probe-brands.ts kith.com --verbose
npx -y deno run --allow-net --allow-env scripts/probe-brands.ts --approved
```

### Deploy the catalog

1. `npx supabase db push` (applies `20260924000000_catalog_sources.sql`; additive, keeps existing product IDs and saved outfits)
2. `npx supabase db query -f supabase/seed.sql` if you still want the 148 demo rows locally
3. Set function secrets: `GEMINI_API_KEY`, `CATALOG_SYNC_SECRET`, `CATALOG_BOT_CONTACT`. Leave `ALLOW_DEMO_CATALOG` unset in production.
4. `npx supabase functions deploy generate-outfit resolve-brand sync-catalog`
5. Store `project_url` and `catalog_sync_secret` in Vault, then run `supabase/cron/schedule_sync_catalog.sql` once so brands refresh about once a day.

## Remaining known limitations

- **Expo Go / web**: native IAP (RevenueCat stores) requires a Dev Client / EAS build; web stubs keep the UI usable.
- **Catalog coverage**: many large retailers block automated indexing (403 / robots.txt). Those brands stay "Not available yet" until an official API or affiliate feed is configured.
- **Shopping**: product taps open `purchase_url` when present; there is no full checkout flow.
- **Gemini**: production Edge Function must set `GEMINI_API_KEY`; local heuristic fallback is for demos only.
- **RevenueCat**: needs a real project key for live purchase data.
- **Saves**: free plan is capped; premium unlocks unlimited saves via RevenueCat entitlement.
- **Rebuild**: premium-gated after the free generation quota.
