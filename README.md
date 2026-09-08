# Styli

Your AI stylist, in your pocket.

## Stack

- React Native + Expo + TypeScript + Expo Router
- Supabase (Postgres, Auth, Edge Functions)
- OpenAI (server-side only via Edge Function)

## Stage status

- Stage 1: Onboarding UI
- Stage 2: Product catalog
- Stage 3: AI outfit generation
- **Stage 4: Auth + saved outfits**
- Not yet: RevenueCat / Premium billing

## App flow

- Generate outfits without signing in
- Sign in required to save
- Tabs: **Home · Saved · Profile**
- Onboarding screens unchanged (Style → Occasion → Budget → Generation → Results)

## Run

```bash
cp .env.example .env
npm install
npx expo start
```

## Auth + save notes

- Email/password via Supabase Auth
- Saved rows go to `outfits` + `outfit_items`
- Profile shows email, preferences, premium placeholder, sign out

```bash
npm run test:auth
```
