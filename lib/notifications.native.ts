import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { LogLevel, OneSignal } from 'react-native-onesignal';

/**
 * OneSignal push notifications for Styli / Vibe (iOS / Android).
 *
 * MVP goals:
 * - Initialize safely without blocking the core app
 * - Ask for permission once, after the user has seen value (first outfit)
 * - Never re-prompt after the user answers (allow or deny)
 * - No-op when App ID / native module is missing
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

const ASKED_STORAGE_KEY = 'styli.notifications.permissionAsked.v1';

let initialized = false;
let askInFlight: Promise<NotificationPermissionResult> | null = null;

function getAppId(): string | null {
  const id = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
  if (!id || id.includes('YOUR_') || id === 'your-onesignal-app-id') {
    return null;
  }
  return id.trim();
}

export function isNotificationsConfigured(): boolean {
  return Boolean(getAppId());
}

export async function hasAskedForNotificationPermission(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ASKED_STORAGE_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

async function markPermissionAsked(): Promise<void> {
  try {
    await AsyncStorage.setItem(ASKED_STORAGE_KEY, '1');
  } catch {
    // Silent — never block outfit UX on storage failures.
  }
}

/**
 * Initialize OneSignal without requesting permission.
 * Safe to call repeatedly; never throws into the UI.
 */
export async function initNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const appId = getAppId();
    if (!appId) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(
          '[notifications] OneSignal not configured — set EXPO_PUBLIC_ONESIGNAL_APP_ID.',
        );
      }
      return;
    }

    if (__DEV__) {
      OneSignal.Debug.setLogLevel(LogLevel.Verbose);
    }

    OneSignal.initialize(appId);
    // Do NOT call requestPermission here — wait for maybeAskNotificationPermission.
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[notifications] init failed silently', err);
    }
  }
}

/**
 * Optionally link the signed-in user for targeting. Failures are ignored.
 */
export async function syncNotificationUser(
  userId?: string | null,
): Promise<void> {
  try {
    if (!getAppId()) return;
    if (userId) {
      OneSignal.login(userId);
    } else {
      OneSignal.logout();
    }
  } catch {
    // Silent.
  }
}

function softPrompt(): Promise<'allow' | 'later'> {
  return new Promise((resolve) => {
    Alert.alert(
      'Fit reminders?',
      'Get occasional nudges to build a new outfit — like “New week, new fit.” You can change this anytime in Settings.',
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => resolve('later'),
        },
        {
          text: 'Notify me',
          onPress: () => resolve('allow'),
        },
      ],
      { cancelable: true, onDismiss: () => resolve('later') },
    );
  });
}

/**
 * Ask once for notification permission after the user has seen an outfit.
 * Never re-asks after the user has answered (allow or deny / not now).
 */
export async function maybeAskNotificationPermission(): Promise<NotificationPermissionResult> {
  if (askInFlight) return askInFlight;

  askInFlight = (async () => {
    try {
      if (!getAppId()) return 'not_configured';
      if (await hasAskedForNotificationPermission()) return 'skipped';

      const choice = await softPrompt();
      await markPermissionAsked();

      if (choice !== 'allow') {
        return 'denied';
      }

      // fallbackToSettings: false — don't bounce users into Settings on deny.
      const granted = await OneSignal.Notifications.requestPermission(false);
      return granted ? 'granted' : 'denied';
    } catch {
      try {
        await markPermissionAsked();
      } catch {
        // ignore
      }
      return 'unsupported';
    } finally {
      askInFlight = null;
    }
  })();

  return askInFlight;
}
