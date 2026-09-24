/**
 * Local event helpers. Product analytics is not sent anywhere.
 * Screens keep calling `trackEvent` so call sites stay in place.
 */
export const ANALYTICS_EVENTS = [
  'app_opened',
  'onboarding_started',
  'style_selected',
  'occasion_selected',
  'budget_selected',
  'inspiration_added',
  'brand_preference_selected',
  'brand_requested',
  'brand_request_checked',
  'onboarding_completed',
  'outfit_generation_started',
  'outfit_generated',
  'outfit_generation_failed',
  'outfit_saved',
  'outfit_rebuilt',
  'product_clicked',
  'paywall_viewed',
  'purchase_started',
  'purchase_completed',
  'subscription_restored',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Coarse budget buckets — avoids storing exact custom amounts when not needed. */
export function getBudgetRange(budget: number): string {
  if (!Number.isFinite(budget) || budget <= 0) return 'unknown';
  if (budget <= 50) return '0-50';
  if (budget <= 75) return '51-75';
  if (budget <= 100) return '76-100';
  if (budget <= 150) return '101-150';
  if (budget <= 200) return '151-200';
  return '200+';
}

export function premiumStatusLabel(isPremium: boolean): 'premium' | 'free' {
  return isPremium ? 'premium' : 'free';
}

/**
 * Record a product event locally in development. Never throws.
 *
 * @example
 * trackEvent('outfit_generated', { style, occasion, budget_range: getBudgetRange(budget) })
 */
export function trackEvent(
  event: AnalyticsEvent,
  properties?: AnalyticsProperties,
): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[analytics]', event, properties ?? {});
  }
}
