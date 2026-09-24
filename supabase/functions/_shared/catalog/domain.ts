import { assertSafeUrl } from './politeFetch.ts';

/** "https://www.Kith.com/collections" -> "kith.com"; null for unsafe or malformed input. */
export function normalizeDomain(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed || trimmed.length > 200) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = assertSafeUrl(withScheme);
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch {
    return null;
  }
}
