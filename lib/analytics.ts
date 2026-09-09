import PostHog from 'posthog-react-native';
import { Platform } from 'react-native';

/**
 * Stage 6 analytics events for Styli / Vibe.
 * Keep screens calling `trackEvent` — never PostHog APIs directly.
 */
export const ANALYTICS_EVENTS = [
  'app_opened',
  'onboarding_started',
  'style_selected',
  'occasion_selected',
  'budget_selected',
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

type RecordedEvent = {
  event: AnalyticsEvent;
  properties: Record<string, string | number | boolean>;
  at: number;
};

const MAX_RECENT = 100;
const recentEvents: RecordedEvent[] = [];

let client: PostHog | null = null;
let initPromise: Promise<PostHog | null> | null = null;
let openedTracked = false;

function getApiKey(): string | null {
  const key = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  if (!key || key.includes('YOUR_') || key === 'your-posthog-api-key') {
    return null;
  }
  return key;
}

function getHost(): string {
  return (
    process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com'
  );
}

export function isAnalyticsConfigured(): boolean {
  return Boolean(getApiKey());
}

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

function sanitizeProperties(
  properties?: AnalyticsProperties,
): Record<string, string | number | boolean> {
  if (!properties) return {};
  const cleaned: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) continue;
    // Never send emails, tokens, or raw user ids by accident.
    if (/email|password|token|secret|phone|name_full/i.test(key)) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

function recordLocal(
  event: AnalyticsEvent,
  properties: Record<string, string | number | boolean>,
): void {
  recentEvents.push({ event, properties, at: Date.now() });
  if (recentEvents.length > MAX_RECENT) {
    recentEvents.shift();
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[analytics]', event, properties);
  }
}

/**
 * Initialize PostHog once. Safe to call repeatedly.
 * Never throws — analytics must not block the app.
 */
export function initAnalytics(): Promise<PostHog | null> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log(
            '[analytics] PostHog not configured — events log locally in development.',
          );
        }
        return null;
      }

      const instance = new PostHog(apiKey, {
        host: getHost(),
        // App open is tracked explicitly as `app_opened`.
        captureAppLifecycleEvents: false,
        enableSessionReplay: false,
        persistence: 'memory',
        preloadFeatureFlags: false,
        sendFeatureFlagEvent: false,
        disableGeoip: true,
        // Send quickly in development so we can verify capture.
        flushAt: __DEV__ ? 1 : 20,
        flushInterval: __DEV__ ? 1000 : 10000,
      });

      await instance.ready();
      client = instance;
      return instance;
    } catch (err) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[analytics] init failed silently', err);
      }
      client = null;
      return null;
    }
  })();

  return initPromise;
}

/**
 * Track a product analytics event. Failures are swallowed.
 *
 * @example
 * trackEvent('outfit_generated', { style, occasion, budget_range: getBudgetRange(budget) })
 */
export function trackEvent(
  event: AnalyticsEvent,
  properties?: AnalyticsProperties,
): void {
  try {
    const cleaned = sanitizeProperties(properties);
    recordLocal(event, cleaned);

    const capture = async () => {
      const ph = client ?? (await initAnalytics());
      if (!ph) return;
      ph.capture(event, cleaned);
      if (__DEV__) {
        await ph.flush();
      }
    };

    void capture().catch(() => {
      // Silent — never block UX.
    });
  } catch {
    // Silent — never block UX.
  }
}

/** Fire once per JS runtime for app opens. */
export function trackAppOpened(): void {
  if (openedTracked) return;
  openedTracked = true;
  trackEvent('app_opened', {
    platform: Platform.OS,
  });
}

export function getRecentAnalyticsEvents(): ReadonlyArray<RecordedEvent> {
  return recentEvents;
}

export function clearRecentAnalyticsEvents(): void {
  recentEvents.length = 0;
}

/** Best-effort flush for tests / debugging. */
export async function flushAnalytics(): Promise<void> {
  try {
    await client?.flush();
  } catch {
    // Silent.
  }
}
