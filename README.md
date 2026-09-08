# Styli

Your AI stylist, in your pocket.

## Stack

- React Native + Expo + TypeScript + Expo Router
- Supabase (Postgres + Edge Functions)
- OpenAI (server-side only via Edge Function)

## Stage status

- Stage 1: Onboarding UI
- Stage 2: Supabase catalog
- **Stage 3: AI outfit generation via `generate-outfit` Edge Function**
- Not yet: auth UI, RevenueCat, OneSignal, PostHog

## Security

The OpenAI API key never ships in the mobile app.

Flow:

`iOS/App → Supabase Edge Function generate-outfit → OpenAI → Supabase products → App`

## Run the app

```bash
cp .env.example .env
# set EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
# set OPENAI_API_KEY as a Supabase Edge Function secret (not in the app)

npm install
npx expo start
```

## Deploy Edge Function

```bash
# From a machine with Supabase CLI + project linked:
supabase secrets set OPENAI_API_KEY=sk-...
supabase functions deploy generate-outfit
```

SQL (Stage 2) must already be applied and seeded.

## Local Stage 3 services (optional)

```bash
# PostgREST + proxy + function (see scripts/)
bash scripts/serve-generate-outfit.sh
node scripts/local-supabase-proxy.mjs
npm run db:verify
npm run test:generate
```

`ALLOW_HEURISTIC_FALLBACK=true` enables a budget-safe local fallback when `OPENAI_API_KEY` is unset. Production should set a real OpenAI key and keep the fallback off.

## Onboarding flow

1. Welcome → Style → Occasion → Budget
2. **Build my fit** → Generation animation while Edge Function runs
3. Results show AI outfit (name, products, DB prices, reasons, tip)
4. **Rebuild** requests a different combination with the same preferences
