# Styli

Your AI stylist, in your pocket.

Stage 1 frontend foundation: Expo + TypeScript onboarding flow with mock outfit generation. No backend integrations yet.

## Stack

- React Native
- Expo
- TypeScript
- Expo Router

## Run locally

```bash
npm install
npx expo start
```

Then:

- Press `i` for iOS Simulator (macOS)
- Press `a` for Android emulator
- Scan the QR code with Expo Go on a physical device
- Press `w` for web preview

Developed primarily for iOS; Windows development works via Expo Go / Android emulator / web.

## Onboarding flow

1. Welcome → Get Started
2. Style selection (one vibe)
3. Occasion selection
4. Budget (presets + custom)
5. Fake generation animation
6. Mock outfit results

Preferences (`selectedStyle`, `selectedOccasion`, `selectedBudget`) are stored in React context for the session.

## Project structure

- `app/` — Expo Router screens
- `components/` — reusable UI
- `context/` — preferences state
- `data/` — mock outfit builder
- `types/` — shared TypeScript types
- `constants/theme.ts` — brand colors / type / spacing
