import { AccessDeniedError } from './types.ts';

export const BOT_TOKEN = 'StyliCatalogBot';

const DEFAULT_MIN_INTERVAL_MS = 1000;
const MAX_CRAWL_DELAY_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const CHALLENGE_MARKERS = [
  'captcha',
  'pardon our interruption',
  'px-captcha',
  'cf-chl',
  'attention required! | cloudflare',
  'access denied</title>',
  'are you a robot',
  'request unsuccessful. incapsula',
];

type RobotsRule = { allow: boolean; pattern: string };
type RobotsPolicy = { rules: RobotsRule[]; crawlDelayMs: number | null; sitemaps: string[] };

export type FetchResult = {
  url: string;
  status: number;
  headers: Headers;
  text: string;
};

export type PoliteFetcherOptions = {
  userAgent?: string;
  minIntervalMs?: number;
  /** Hard cap on outbound requests for one fetcher (one resolve or sync run). */
  maxRequests?: number;
  fetchImpl?: typeof fetch;
};

/**
 * The only way catalog code talks to the outside web: honors robots.txt, spaces out requests
 * per host, refuses private/internal addresses, and stops (never retries) on blocks or captchas.
 */
export class PoliteFetcher {
  readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly maxRequests: number;
  private readonly fetchImpl: typeof fetch;
  private readonly robots = new Map<string, Promise<RobotsPolicy>>();
  private readonly lastRequestAt = new Map<string, number>();
  private requestCount = 0;

  constructor(options: PoliteFetcherOptions = {}) {
    const contact = Deno.env.get('CATALOG_BOT_CONTACT');
    this.userAgent =
      options.userAgent ??
      `${BOT_TOKEN}/1.0 (product catalog indexer${contact ? `; +${contact}` : ''})`;
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.maxRequests = options.maxRequests ?? 80;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get requestsMade(): number {
    return this.requestCount;
  }

  /** Follows redirects on robots.txt (checking each hop) to find the site's real origin. */
  async canonicalOrigin(domain: string): Promise<string> {
    for (const candidate of [`https://${domain}`, `https://www.${domain}`]) {
      let current = assertSafeUrl(`${candidate}/robots.txt`);
      try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
          const response = await this.request(current, { accept: 'text/plain,*/*' });
          await response.body?.cancel();
          const location = response.headers.get('location');
          if (response.status >= 300 && response.status < 400 && location) {
            current = assertSafeUrl(new URL(location, current).href);
            continue;
          }
          if (response.status < 500) return current.origin;
          break;
        }
      } catch (err) {
        if (err instanceof AccessDeniedError) throw err;
      }
    }
    return `https://${domain}`;
  }

  async sitemapsFor(origin: string): Promise<string[]> {
    return (await this.policyFor(new URL(origin))).sitemaps;
  }

  async isAllowed(url: string): Promise<boolean> {
    const parsed = new URL(url);
    const policy = await this.policyFor(parsed);
    return isPathAllowed(policy.rules, parsed.pathname + parsed.search);
  }

  async getText(
    url: string,
    options: { accept?: string; maxBytes?: number; timeoutMs?: number } = {},
  ): Promise<FetchResult> {
    let current = assertSafeUrl(url);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!(await this.isAllowed(current.href))) {
        throw new AccessDeniedError(`robots.txt disallows ${current.pathname}`, 'robots');
      }
      const response = await this.request(current, options);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) break;
        current = assertSafeUrl(new URL(location, current).href);
        continue;
      }
      const text = await readLimited(response, options.maxBytes ?? DEFAULT_MAX_BYTES);
      checkForBlock(response, text);
      return { url: current.href, status: response.status, headers: response.headers, text };
    }
    throw new Error(`Too many redirects for ${url}`);
  }

  async getJson<T>(url: string, options: { maxBytes?: number } = {}): Promise<T | null> {
    const result = await this.getText(url, { ...options, accept: 'application/json' });
    if (result.status !== 200) return null;
    const type = result.headers.get('content-type') ?? '';
    if (!type.includes('json') && !/^\s*[\[{]/.test(result.text)) return null;
    try {
      return JSON.parse(result.text) as T;
    } catch {
      return null;
    }
  }

  private async request(
    url: URL,
    options: { accept?: string; timeoutMs?: number },
  ): Promise<Response> {
    if (this.requestCount >= this.maxRequests) {
      throw new Error('request budget exhausted');
    }
    await this.waitForTurn(url);
    this.requestCount += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      return await this.fetchImpl(url.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgent,
          Accept: options.accept ?? 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async waitForTurn(url: URL): Promise<void> {
    const policy = await this.policyFor(url);
    const interval = Math.max(this.minIntervalMs, policy.crawlDelayMs ?? 0);
    const last = this.lastRequestAt.get(url.host) ?? 0;
    const wait = last + interval - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt.set(url.host, Date.now());
  }

  private policyFor(url: URL): Promise<RobotsPolicy> {
    const key = url.origin;
    let cached = this.robots.get(key);
    if (!cached) {
      cached = this.loadRobots(url);
      this.robots.set(key, cached);
    }
    return cached;
  }

  private async loadRobots(url: URL): Promise<RobotsPolicy> {
    const robotsUrl = new URL('/robots.txt', url.origin);
    this.lastRequestAt.set(url.host, Date.now());
    this.requestCount += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      let target = robotsUrl;
      let response = await this.fetchImpl(target.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': this.userAgent, Accept: 'text/plain,*/*' },
      });
      for (let hop = 0; hop < MAX_REDIRECTS && response.status >= 300 && response.status < 400; hop += 1) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) break;
        target = assertSafeUrl(new URL(location, target).href);
        response = await this.fetchImpl(target.href, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': this.userAgent, Accept: 'text/plain,*/*' },
        });
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        return { rules: [], crawlDelayMs: null, sitemaps: [] };
      }
      // RFC 9309: 4xx means no restrictions; 5xx or network failure means assume full disallow.
      if (response.status >= 500) {
        await response.body?.cancel();
        return { rules: [{ allow: false, pattern: '/' }], crawlDelayMs: null, sitemaps: [] };
      }
      if (response.status >= 400) {
        await response.body?.cancel();
        return { rules: [], crawlDelayMs: null, sitemaps: [] };
      }
      return parseRobots(await readLimited(response, 512 * 1024), BOT_TOKEN);
    } catch {
      return { rules: [{ allow: false, pattern: '/' }], crawlDelayMs: null, sitemaps: [] };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function parseRobots(text: string, token: string): RobotsPolicy {
  type Group = { agents: string[]; rules: RobotsRule[]; crawlDelayMs: number | null };
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelayMs: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      if (field === 'disallow' && value === '') continue;
      current.rules.push({ allow: field === 'allow', pattern: value });
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) {
        current.crawlDelayMs = Math.min(seconds * 1000, MAX_CRAWL_DELAY_MS);
      }
    }
  }

  const lowerToken = token.toLowerCase();
  const specific = groups.filter((group) =>
    group.agents.some((agent) => agent !== '*' && lowerToken.includes(agent)),
  );
  const chosen = specific.length ? specific : groups.filter((group) => group.agents.includes('*'));
  return {
    rules: chosen.flatMap((group) => group.rules),
    crawlDelayMs: chosen.reduce<number | null>(
      (max, group) => (group.crawlDelayMs !== null ? Math.max(max ?? 0, group.crawlDelayMs) : max),
      null,
    ),
    sitemaps,
  };
}

export function isPathAllowed(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!robotsPatternMatches(rule.pattern, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

function robotsPatternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${regex}${anchored ? '$' : ''}`).test(path);
}

/** Only public http(s) hosts on default ports; blocks localhost, private ranges and IP literals. */
export function assertSafeUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AccessDeniedError('Invalid URL', 'unsafe_url');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AccessDeniedError('Only http(s) URLs are allowed', 'unsafe_url');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new AccessDeniedError('Non-standard ports are not allowed', 'unsafe_url');
  }
  if (url.username || url.password) {
    throw new AccessDeniedError('Credentials in URLs are not allowed', 'unsafe_url');
  }
  const host = url.hostname.toLowerCase();
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isIpv6 = host.includes(':') || host.startsWith('[');
  if (
    isIpv4 ||
    isIpv6 ||
    !host.includes('.') ||
    host === 'localhost' ||
    /\.(local|localhost|internal|intranet|lan|home|corp)$/.test(host)
  ) {
    throw new AccessDeniedError('Private or internal hosts are not allowed', 'unsafe_url');
  }
  return url;
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeded ${Math.round(maxBytes / 1024)} KB`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function checkForBlock(response: Response, text: string): void {
  if (response.status === 429) {
    throw new AccessDeniedError('Site rate-limited the request', 'rate_limited');
  }
  if (response.status === 401 || response.status === 403) {
    throw new AccessDeniedError(`Site denied access (HTTP ${response.status})`, 'blocked');
  }
  if (response.headers.get('cf-mitigated') === 'challenge') {
    throw new AccessDeniedError('Site presented a bot challenge', 'blocked');
  }
  const type = response.headers.get('content-type') ?? '';
  // Challenge interstitials are small; full product pages may mention reCAPTCHA in forms.
  if (type.includes('html') && (text.length < 30_000 || response.status >= 400)) {
    const head = text.slice(0, 20_000).toLowerCase();
    if (CHALLENGE_MARKERS.some((marker) => head.includes(marker))) {
      throw new AccessDeniedError('Site presented a bot challenge', 'blocked');
    }
  }
}
