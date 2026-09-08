# Styli

Your AI stylist, in your pocket.

## Stack

- React Native + Expo + TypeScript + Expo Router
- Supabase (Postgres, Auth-ready schema, product catalog)

## Stage status

- **Stage 1:** Onboarding UI (complete)
- **Stage 2:** Supabase backend + product catalog (current)
- Not yet: OpenAI, auth UI, RevenueCat, OneSignal, PostHog

## Run the app

```bash
cp .env.example .env
# fill EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY

npm install
npx expo start
```

## Supabase setup

1. Create a Supabase project.
2. In the SQL editor, run:
   - `supabase/migrations/20260322000000_init_styli_schema.sql`
   - `supabase/seed.sql` (148 products)
3. Copy Project URL + anon key into `.env` (see `.env.example`).
4. Never put the service-role key in the mobile app.

Optional scripts:

```bash
# Regenerate seed SQL + JSON from the product generator
node scripts/generate-product-seed.mjs

# Upsert products with the service-role key (server/dev only)
node --env-file=.env scripts/seed-products.mjs

# Verify anon client can read products
node --env-file=.env scripts/verify-supabase.mjs
```

### Local PostgREST (optional, for this repo’s agent/dev machine)

```bash
# After local Postgres has schema + seed applied:
 /tmp/postgrest supabase/local/postgrest.conf
node scripts/local-supabase-proxy.mjs
node --env-file=.env scripts/verify-supabase.mjs
```

## Onboarding flow

1. Welcome → Get Started
2. Style → Occasion → Budget
3. Generation animation
4. Outfit results (products fetched from Supabase)

## Project structure

- `app/` — Expo Router screens
- `components/` — reusable UI
- `context/` — onboarding preferences
- `lib/` — Supabase client + product/outfit helpers
- `supabase/` — migrations, seed, local helpers
- `types/` — UI + database TypeScript types
- `data/product-seed.json` — seed source mirror (148 products)
