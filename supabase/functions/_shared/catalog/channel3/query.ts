import type { ProductCategory } from '../types.ts';
import type { Channel3SearchRequest } from './types.ts';

/** Styli slot → Channel3 text query. Callers pass category/style; no retailer is implied. */
export const CHANNEL3_CATEGORY_QUERIES: Record<ProductCategory, string> = {
  top: 'tops shirts hoodies tanks sweaters',
  bottom: 'pants jeans shorts skirts leggings',
  shoes: 'shoes sneakers boots loafers sandals',
  outerwear: 'jackets coats blazers outerwear',
  accessory: 'bags hats belts accessories',
};

export type Channel3SearchIntent = {
  query?: string;
  style?: string;
  category?: ProductCategory;
  brands?: string[];
  websites?: string[];
  page_token?: string;
};

export function buildChannel3Query(intent: Channel3SearchIntent): string | null {
  const parts = [
    intent.query?.trim(),
    intent.style?.trim(),
    intent.category ? CHANNEL3_CATEGORY_QUERIES[intent.category] : '',
  ].filter(Boolean);
  if (parts.length) return parts.join(' ');
  if (intent.brands?.[0]?.trim()) return intent.brands[0].trim();
  if (intent.websites?.length || intent.page_token) return 'clothing';
  return null;
}

export function buildChannel3Filters(input: {
  brandIds?: string[];
  websites?: string[];
}): Channel3SearchRequest['filters'] {
  const brandIds = (input.brandIds ?? []).filter(Boolean);
  const websites = (input.websites ?? []).map((site) => site.trim()).filter(Boolean);
  return {
    availability: ['InStock'],
    ...(brandIds.length ? { brand_ids: brandIds } : {}),
    ...(websites.length ? { website_ids: websites } : {}),
  };
}

export function readStringList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    .map((entry) => entry.trim());
}
