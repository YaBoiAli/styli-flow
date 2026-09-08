import type { Style } from '@/types';

/** RevenueCat entitlement identifier (source of truth). */
export const PREMIUM_ENTITLEMENT_ID = 'premium';

/** Preferred package / product identifiers for offerings. */
export const PRODUCT_IDS = {
  monthly:
    process.env.EXPO_PUBLIC_RC_MONTHLY_PRODUCT_ID ?? 'vibe_premium_monthly',
  yearly:
    process.env.EXPO_PUBLIC_RC_YEARLY_PRODUCT_ID ?? 'vibe_premium_yearly',
} as const;

export const FREE_GENERATION_LIMIT = 3;

/** Free accounts can keep this many saved outfits; premium is unlimited. */
export const FREE_SAVE_LIMIT = 3;

export const PREMIUM_STYLES: Style[] = [
  'Runway',
  'Quiet Luxury',
  'Dark Academia',
  'Elevated Streetwear',
];

export function isPremiumStyle(style: Style): boolean {
  return PREMIUM_STYLES.includes(style);
}

export const PAYWALL_FEATURES = [
  'Unlimited AI fits',
  'Premium trends',
  'Unlimited saves',
  'Rebuild any outfit',
  'Personalized styling',
] as const;
