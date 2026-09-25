import {
  classifyCategory,
  cleanDescription,
  detectGender,
  detectMaterial,
  isValidProduct,
  normalizeAvailability,
  uniqueClean,
} from '../normalize.ts';
import type { Availability, NormalizedProduct, ProductCategory, SourceType } from '../types.ts';
import type { Channel3Brand, Channel3Image, Channel3Offer, Channel3Product } from './types.ts';

/**
 * Persisted as `external_search` because products.source CHECK does not include
 * `channel3` yet (no schema migration). Identity is still Channel3 via the prefix.
 */
export const CHANNEL3_SOURCE: SourceType = 'external_search';
export const CHANNEL3_ID_PREFIX = 'channel3:';

export function channel3SourceProductId(productId: string): string {
  return `${CHANNEL3_ID_PREFIX}${productId}`;
}

export function isChannel3SourceProductId(value: string): boolean {
  return value.startsWith(CHANNEL3_ID_PREFIX) && value.length > CHANNEL3_ID_PREFIX.length;
}

export function pickBrandMatch(
  brands: Channel3Brand[],
  query: string,
): Channel3Brand | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  return (
    brands.find((brand) => brand.name.trim().toLowerCase() === needle) ??
    brands.find((brand) => brand.name.trim().toLowerCase().startsWith(needle)) ??
    null
  );
}

export function selectChannel3Image(images: Channel3Image[] | undefined): string | null {
  if (!images?.length) return null;
  const ordered = [...images].sort(
    (left, right) => Number(Boolean(right.is_main_image)) - Number(Boolean(left.is_main_image)),
  );
  for (const image of ordered) {
    const cleaned = usableImageUrl(image.cleaned_url);
    if (cleaned) return cleaned;
    const raw = usableImageUrl(image.url);
    if (raw) return raw;
  }
  return null;
}

function usableImageUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const href = value.trim().startsWith('//') ? `https:${value.trim()}` : value.trim();
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function selectChannel3Offer(
  offers: Channel3Offer[] | undefined,
  preferredWebsites?: string[] | null,
): Channel3Offer | null {
  if (!offers?.length) return null;
  const usable = offers.filter(isUsableOffer);
  const inStock = usable.filter((offer) => offer.availability !== 'OutOfStock');
  const usd = inStock.filter((offer) => offer.price.currency.toUpperCase() === 'USD');
  if (!usd.length) return null;
  const preferred = (preferredWebsites ?? [])
    .map((site) => site.trim())
    .filter(Boolean)
    .flatMap((site) => usd.filter((offer) => offerMatchesWebsite(offer, site)));
  const pool = preferred.length ? preferred : usd;
  return pool.reduce((best, offer) => (offer.price.price < best.price.price ? offer : best));
}

export function mapChannel3Availability(value: Channel3Offer['availability'] | undefined): Availability {
  if (!value) return 'in_stock';
  return normalizeAvailability(value === 'InStock' ? 'in_stock' : 'out_of_stock');
}

export function mapChannel3Category(
  product: Channel3Product,
): { category: ProductCategory; subcategory: string } | null {
  const category = product.category;
  const pathText = (category?.path ?? []).map((entry) => `${entry.title} ${entry.slug}`).join(' ');
  const tags = uniqueClean([
    category?.title,
    category?.slug,
    ...(category?.path ?? []).flatMap((entry) => [entry.title, entry.slug]),
  ]);
  return classifyCategory(
    [category?.title, category?.slug, pathText].filter(Boolean).join(' '),
    product.title ?? '',
    tags,
  );
}

export type NormalizeSkipReason =
  | 'missing_id'
  | 'missing_title'
  | 'unmapped_category'
  | 'no_offer'
  | 'no_image'
  | 'invalid_product';

export type NormalizeResult =
  | {
      ok: true;
      product: NormalizedProduct;
      offerDomain: string;
      channel3BrandName: string;
    }
  | { ok: false; reason: NormalizeSkipReason; product_id?: string };

export function normalizeChannel3Product(
  raw: Channel3Product | null | undefined,
  options: {
    now: string;
    preferredWebsites?: string[] | null;
    fallbackBrand?: string;
  },
): NormalizeResult {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) {
    return { ok: false, reason: 'missing_id' };
  }
  const id = raw.id.trim();
  if (typeof raw.title !== 'string' || !raw.title.trim()) {
    return { ok: false, reason: 'missing_title', product_id: id };
  }

  const classified = mapChannel3Category(raw);
  if (!classified) {
    return { ok: false, reason: 'unmapped_category', product_id: id };
  }

  const offer = selectChannel3Offer(raw.offers, options.preferredWebsites);
  if (!offer) {
    return { ok: false, reason: 'no_offer', product_id: id };
  }

  const imageUrl = selectChannel3Image(raw.images);
  if (!imageUrl) {
    return { ok: false, reason: 'no_image', product_id: id };
  }

  const brand =
    raw.brands?.find((entry) => entry.name?.trim())?.name.trim() ||
    options.fallbackBrand ||
    'Unknown';
  const colors = uniqueClean(raw.structured_attributes?.color ?? []);
  const sizes = uniqueClean(
    (raw.variants?.options ?? [])
      .filter((option) => /size/i.test(option.name ?? ''))
      .flatMap((option) => option.values ?? []),
  );
  const gender =
    raw.gender === 'male'
      ? 'men'
      : raw.gender === 'female'
        ? 'women'
        : detectGender(raw.title, raw.description, classified.subcategory);

  const product: NormalizedProduct = {
    brand,
    product_name: raw.title.trim(),
    description: cleanDescription(raw.description),
    price: offer.price.price,
    currency: offer.price.currency.toUpperCase(),
    image_url: imageUrl,
    product_url: offer.url,
    category: classified.category,
    subcategory: classified.subcategory,
    colors,
    sizes,
    material: raw.materials?.length
      ? raw.materials.slice(0, 3).join(', ')
      : detectMaterial(raw.description, raw.title),
    gender,
    availability: mapChannel3Availability(offer.availability),
    source: CHANNEL3_SOURCE,
    source_product_id: channel3SourceProductId(id),
    last_checked: options.now,
  };

  if (!isValidProduct(product) || product.availability !== 'in_stock') {
    return { ok: false, reason: 'invalid_product', product_id: id };
  }
  return {
    ok: true,
    product,
    offerDomain: normalizeDomain(offer.domain) || hostFromUrl(offer.url) || 'unknown',
    channel3BrandName: brand,
  };
}

export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .toLowerCase() || null;
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isUsableOffer(offer: Channel3Offer): boolean {
  return (
    Boolean(offer?.url) &&
    /^https?:\/\//.test(offer.url) &&
    Number.isFinite(offer.price?.price) &&
    offer.price.price > 0 &&
    typeof offer.price.currency === 'string' &&
    /^[A-Z]{3}$/i.test(offer.price.currency)
  );
}

function offerMatchesWebsite(offer: Channel3Offer, website: string): boolean {
  const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  const offerDomain = (offer.domain ?? '').replace(/^www\./, '').toLowerCase();
  if (offerDomain === domain || offerDomain.endsWith(`.${domain}`)) return true;
  try {
    const host = new URL(offer.url).hostname.toLowerCase().replace(/^www\./, '');
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}
