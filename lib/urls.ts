import type { InspirationLinkKind } from '@/types';

/**
 * Parse user-entered text into an http(s) URL. Adds https:// when the user
 * types a bare domain like "fearofgod.com".
 */
export function normalizeWebUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) {
    return null;
  }
  return url;
}

function hostMatches(url: URL, domains: string[]): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

const LINK_ERRORS: Record<InspirationLinkKind, string> = {
  link: 'Enter a valid link, like https://example.com/outfit.',
  pinterest: 'Paste a Pinterest link, like https://pinterest.com/pin/…',
  instagram: 'Paste an Instagram post or Reel link.',
};

/** Validate an inspiration link for its source type. */
export function validateInspirationUrl(
  kind: InspirationLinkKind,
  input: string,
): { ok: true; url: string } | { ok: false; message: string } {
  const url = normalizeWebUrl(input);
  if (!url) return { ok: false, message: LINK_ERRORS[kind] };

  if (kind === 'pinterest' && !hostMatches(url, ['pinterest.com', 'pin.it'])) {
    // Pinterest serves country domains like pinterest.co.uk and pinterest.ca.
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const isRegional = /(^|\.)pinterest\.[a-z.]+$/.test(host);
    if (!isRegional) return { ok: false, message: LINK_ERRORS.pinterest };
  }

  if (kind === 'instagram') {
    const isInstagram = hostMatches(url, ['instagram.com', 'instagr.am']);
    const isPost = /^\/(?:[^/]+\/)?(p|reel|reels|tv)\/[^/]+/i.test(url.pathname);
    if (!isInstagram || !isPost) {
      return { ok: false, message: LINK_ERRORS.instagram };
    }
  }

  return { ok: true, url: url.toString() };
}
