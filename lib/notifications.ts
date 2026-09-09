/**
 * Web stub for OneSignal — push is native-only.
 * Keeps Expo web / demos running when notifications are denied or unavailable.
 */

export type NotificationPermissionResult =
  | 'granted'
  | 'denied'
  | 'skipped'
  | 'unsupported'
  | 'not_configured';

/** Example re-engagement copy for OneSignal dashboard / hackathon demos. */
export const EXAMPLE_REENGAGEMENT_NOTIFICATIONS = [
  {
    title: 'Styli',
    body: 'New week, new fit 👀',
  },
  {
    title: 'Styli',
    body: 'Going out tonight? Let Vibe build your fit.',
  },
  {
    title: 'Styli',
    body: 'New seasonal styles just dropped.',
  },
] as const;

export function isNotificationsConfigured(): boolean {
  return false;
}

export async function hasAskedForNotificationPermission(): Promise<boolean> {
  return true;
}

export async function initNotifications(): Promise<void> {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[notifications] OneSignal skipped on web.');
  }
}

export async function syncNotificationUser(
  _userId?: string | null,
): Promise<void> {
  // No-op on web.
}

export async function maybeAskNotificationPermission(): Promise<NotificationPermissionResult> {
  return 'unsupported';
}
