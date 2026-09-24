# Styli (Vibe)

Your AI stylist, in your pocket.

Gen-Z · Minimal · Premium · Fashion-forward.

## Stack

- React Native + Expo + TypeScript + Expo Router
- Supabase (Postgres, Auth, Edge Functions)
- OpenAI (server-side only via Edge Function)
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
  functions/generate-outfit/
  seed.sql
scripts/                  # local proxy, seed, verification
data/                     # product seed JSON
```

## Environment variables

Copy `.env.example` → `.env`:

| Variable | Required | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Project URL or local proxy (`http://127.0.0.1:54321`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon/public key only in the app |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Edge Function / seed scripts |
| `OPENAI_API_KEY` | server | Edge Function only — never ship to the client |
| `OPENAI_MODEL` | optional | defaults to `gpt-4o-mini` |
| `ALLOW_HEURISTIC_FALLBACK` | local | `true` for offline generation without OpenAI |
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

## Remaining known limitations

- **Expo Go / web**: native IAP (RevenueCat stores) requires a Dev Client / EAS build; web stubs keep the UI usable.
- **Shopping**: product taps open `purchase_url` when present; there is no full checkout flow.
- **OpenAI**: production Edge Function must set `OPENAI_API_KEY`; local heuristic fallback is for demos only.
- **RevenueCat**: needs a real project key for live purchase data.
- **Saves**: free plan is capped; premium unlocks unlimited saves via RevenueCat entitlement.
- **Rebuild**: premium-gated after the free generation quota.
