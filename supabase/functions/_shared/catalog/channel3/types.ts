/** Channel3 public API shapes used by the Styli catalog provider. */

export type Channel3Gender = 'male' | 'female';
export type Channel3Availability = 'InStock' | 'OutOfStock';

export type Channel3Brand = {
  id: string;
  name: string;
};

export type Channel3Image = {
  url: string;
  cleaned_url?: string | null;
  is_main_image?: boolean;
};

export type Channel3CategoryRef = {
  slug: string;
  title: string;
};

export type Channel3Category = {
  slug: string;
  title: string;
  path?: Channel3CategoryRef[];
  has_children?: boolean;
};

export type Channel3Price = {
  price: number;
  compare_at_price?: number | null;
  currency: string;
};

export type Channel3Offer = {
  url: string;
  domain: string;
  price: Channel3Price;
  availability: Channel3Availability;
};

export type Channel3Product = {
  id: string;
  title: string;
  description?: string | null;
  brands?: Channel3Brand[];
  images?: Channel3Image[];
  category?: Channel3Category | null;
  gender?: Channel3Gender | null;
  materials?: string[] | null;
  offers?: Channel3Offer[];
  structured_attributes?: Record<string, string[]>;
  variants?: {
    options?: Array<{ name?: string; values?: string[] }>;
  } | null;
};

export type Channel3SearchRequest = {
  query?: string | null;
  limit?: number | null;
  page_token?: string | null;
  filters?: {
    brand_ids?: string[] | null;
    website_ids?: string[] | null;
    category_ids?: string[] | null;
    availability?: Channel3Availability[];
  };
  config?: {
    country?: string;
    currency?: string;
    language?: string;
  };
};

export type Channel3SearchResponse = {
  products: Channel3Product[];
  next_page_token?: string | null;
};

export type Channel3BrandSearchResponse = {
  brands: Channel3Brand[];
};

export class Channel3Error extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string,
  ) {
    super(message);
    this.name = 'Channel3Error';
  }
}

export function reasonForStatus(status: number): string {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 402) return 'payment_required';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_error';
  if (status >= 400) return 'request_error';
  return 'unknown';
}
