# Styli

Your AI stylist, in your pocket.

## Stack

- React Native + Expo + TypeScript + Expo Router
- Supabase (Postgres, Auth, Edge Functions)
- OpenAI (server-side only via Edge Function)
- RevenueCat (subscriptions / premium entitlement)
- PostHog (product analytics)

## Stage status

- Stage 1: Onboarding UI
- Stage 2: Product catalog
- Stage 3: AI outfit generation
- Stage 4: Auth + saved outfits
- Stage 5: RevenueCat Premium
- **Stage 6: PostHog analytics**

## Analytics (PostHog)

Events are tracked via `lib/analytics.ts` (`trackEvent`). Screens never call PostHog directly. Failures are silent and never block UX.

```bash
EXPO_PUBLIC_POSTHOG_API_KEY=phc_...
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Local capture verification:

```bash
npm run analytics:dev-capture
# then point EXPO_PUBLIC_POSTHOG_HOST=http://127.0.0.1:8439 and restart Expo
npm run test:analytics
```

## Premium (RevenueCat)

- Entitlement: `premium`
- Products: `vibe_premium_monthly`, `vibe_premium_yearly`
- Free: 3 AI outfit generations, limited saves, free styles
- Premium (Vibe Pro): unlimited generations, unlimited saves, premium styles, rebuild, advanced personalization
- Premium styles (visible with Pro badge; tap opens paywall): Runway, Quiet Luxury, Dark Academia, Elevated Streetwear
- Profile plan label comes from RevenueCat entitlement (`Vibe Pro` / `Free Plan`)

### Configure RevenueCat

1. Create a RevenueCat project and enable **Test Store**
2. Create products `vibe_premium_monthly` and `vibe_premium_yearly`
3. Attach both to entitlement `premium` and add them to the current Offering
4. Copy the Test Store public API key (`test_…`) into `.env`:

```bash
EXPO_PUBLIC_REVENUECAT_API_KEY=test_...
```

For release builds, set platform keys (`appl_…` / `goog_…`) via `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`.

Native IAP requires a custom Expo Dev Client / EAS build (not Expo Go). Web uses the React Native Purchases web mapping + Test Store / RevenueCat Billing.

## Run

```bash
cp .env.example .env
npm install
npx expo start
```

## Auth + save notes

- Email/password via Supabase Auth
- Saved rows go to `outfits` + `outfit_items`
- Profile shows email, preferences, plan from RevenueCat, sign out

```bash
npm run test:auth
npm run test:subscription
```
