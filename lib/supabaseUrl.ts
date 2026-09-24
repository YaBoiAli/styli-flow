import Constants from 'expo-constants';
import { Platform } from 'react-native';

function lanHostname(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.debuggerHost ??
    '';
  const host = hostUri.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  return null;
}

/**
 * Rewrites a loopback Supabase URL to the Expo machine's LAN host so a phone
 * can reach the local proxy. Hosted project URLs are left alone.
 */
export function getSupabaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  if (!configured) return '';

  try {
    const url = new URL(configured);
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      return configured.replace(/\/$/, '');
    }
    const host = lanHostname();
    if (!host) return configured.replace(/\/$/, '');
    url.hostname = host;
    return url.toString().replace(/\/$/, '');
  } catch {
    return configured;
  }
}
