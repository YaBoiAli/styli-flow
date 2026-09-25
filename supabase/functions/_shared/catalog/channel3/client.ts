import {
  Channel3Error,
  type Channel3BrandSearchResponse,
  type Channel3SearchRequest,
  type Channel3SearchResponse,
  reasonForStatus,
} from './types.ts';

export const CHANNEL3_API_BASE = 'https://api.trychannel3.com';
export const CHANNEL3_SEARCH_PATH = '/v1/search';
export const CHANNEL3_BRANDS_SEARCH_PATH = '/v1/brands/search';

const SEARCH_MAX = 30;
const SEARCH_DEFAULT = 20;

export type Channel3Env = {
  get(name: string): string | undefined;
};

export function readChannel3ApiKey(env: Channel3Env): string | null {
  const key = env.get('CHANNEL3_API_KEY')?.trim();
  return key || null;
}

export class Channel3Client {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly apiKey: string,
    options: { fetch?: typeof fetch } = {},
  ) {
    if (!apiKey) {
      throw new Channel3Error('CHANNEL3_API_KEY is not set', 0, 'missing_api_key');
    }
    this.fetchImpl = options.fetch ?? fetch;
  }

  async search(request: Channel3SearchRequest): Promise<Channel3SearchResponse> {
    const limit = clampLimit(request.limit);
    const body: Channel3SearchRequest = {
      ...request,
      limit,
      filters: {
        availability: ['InStock'],
        ...request.filters,
      },
      config: {
        country: 'US',
        currency: 'USD',
        language: 'en',
        ...request.config,
      },
    };
    const payload = await this.request<Channel3SearchResponse>(CHANNEL3_SEARCH_PATH, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!payload || !Array.isArray(payload.products)) {
      throw new Channel3Error('malformed search response', 200, 'malformed_response');
    }
    return payload;
  }

  async searchBrands(query: string, limit = 5): Promise<Channel3BrandSearchResponse> {
    const params = new URLSearchParams({
      query,
      limit: String(Math.min(20, Math.max(1, limit))),
      country: 'US',
    });
    const payload = await this.request<Channel3BrandSearchResponse>(
      `${CHANNEL3_BRANDS_SEARCH_PATH}?${params}`,
      { method: 'GET' },
    );
    if (!payload || !Array.isArray(payload.brands)) {
      throw new Channel3Error('malformed brand search response', 200, 'malformed_response');
    }
    return payload;
  }

  /**
   * Follow Channel3 `next_page_token` until `limit` products or `maxPages`.
   * Search max page size is 30.
   */
  async searchPages(input: {
    query: string;
    filters?: Channel3SearchRequest['filters'];
    limit: number;
    maxPages?: number;
    pageToken?: string | null;
  }): Promise<{ products: Channel3SearchResponse['products']; pages: number }> {
    const collected: Channel3SearchResponse['products'] = [];
    let pageToken = input.pageToken ?? null;
    let pages = 0;
    const maxPages = input.maxPages ?? 3;
    while (collected.length < input.limit && pages < maxPages) {
      const remaining = input.limit - collected.length;
      const response = await this.search({
        query: input.query,
        limit: Math.min(SEARCH_MAX, remaining),
        page_token: pageToken,
        filters: input.filters,
      });
      pages += 1;
      collected.push(...response.products);
      if (!response.next_page_token) break;
      pageToken = response.next_page_token;
    }
    return { products: collected.slice(0, input.limit), pages };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${CHANNEL3_API_BASE}${path}`, {
        ...init,
        headers: {
          'x-api-key': this.apiKey,
          Accept: 'application/json',
          ...(init.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new Channel3Error('Channel3 request failed', 0, 'network_error');
    }

    if (!response.ok) {
      await response.body?.cancel?.();
      throw new Channel3Error(
        `Channel3 HTTP ${response.status}`,
        response.status,
        reasonForStatus(response.status),
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new Channel3Error('Channel3 returned non-JSON', response.status, 'malformed_response');
    }
  }
}

function clampLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SEARCH_DEFAULT;
  return Math.min(SEARCH_MAX, Math.max(1, Math.floor(value)));
}
