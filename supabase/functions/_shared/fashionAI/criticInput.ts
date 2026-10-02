import { isFootwearProduct } from '../../generate-outfit/footwearPreference.ts';
import type { FashionCriticProduct, FashionRevisionCatalogProduct } from './types.ts';
import { visualForPrompt, type VisualAttributes } from '../catalog/visualAttributes.ts';

export type CatalogLike = {
  id: string;
  name: string;
  brand: string;
  category: string;
  subcategory?: string | null;
  color?: string | null;
  colors?: string[];
  material?: string | null;
  fit?: string | null;
  silhouette?: string | null;
  style_tags?: string[];
  aesthetic_tags?: string[];
  occasion_tags?: string[];
  image_url?: string | null;
  visual_attributes?: VisualAttributes | null;
};

export function isUsableImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function criticProductsFromCatalog(products: CatalogLike[]): FashionCriticProduct[] {
  const seenImages = new Set<string>();
  return products.map((product) => {
    const rawUrl = product.image_url ?? null;
    const usable = isUsableImageUrl(rawUrl);
    const unique = usable && rawUrl && !seenImages.has(rawUrl);
    if (unique && rawUrl) seenImages.add(rawUrl);
    const visual = visualForPrompt(product.visual_attributes);
    return {
      product_id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      subcategory: product.subcategory ?? null,
      color: product.color ?? '',
      colors: product.colors ?? [],
      material: product.material ?? null,
      fit: product.fit ?? null,
      silhouette: product.silhouette ?? null,
      style_tags: product.style_tags ?? [],
      aesthetic_tags: product.aesthetic_tags ?? [],
      occasion_tags: product.occasion_tags ?? [],
      image_url: unique ? rawUrl : null,
      image_available: Boolean(unique),
      ...(visual ? { visual } : {}),
    };
  });
}

export function criticImageUrls(products: FashionCriticProduct[]): string[] {
  return products
    .filter((product) => product.image_available && product.image_url)
    .map((product) => product.image_url as string);
}

export type RevisionCatalogOptions = {
  /** Current outfit IDs stay eligible even without visual enrichment. */
  keepProductIds?: Iterable<string>;
  /** Rebuild / prior-outfit exclusions must never re-enter the revision catalog. */
  excludeIds?: Iterable<string>;
  /** No Shoes: drop footwear with the shared isFootwearProduct helper. */
  footwearPreference?: 'include' | 'none';
};

/**
 * Slim candidate-pool metadata for revision. No image URLs (token control).
 * When keepProductIds is provided, swaps are limited to visually analyzed products
 * plus the current outfit. Excluded IDs are dropped even if they appear in the pool.
 */
export function revisionCatalogFromProducts(
  products: CatalogLike[],
  options: RevisionCatalogOptions = {},
): FashionRevisionCatalogProduct[] {
  const keep = options.keepProductIds ? new Set([...options.keepProductIds]) : null;
  const excluded = options.excludeIds ? new Set([...options.excludeIds]) : null;
  const dropFootwear = options.footwearPreference === 'none';
  const catalog: FashionRevisionCatalogProduct[] = [];
  for (const product of products) {
    if (excluded?.has(product.id)) continue;
    if (dropFootwear && isFootwearProduct(product)) continue;
    const visual = visualForPrompt(product.visual_attributes);
    if (keep && !keep.has(product.id) && !visual) continue;
    catalog.push({
      product_id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      subcategory: product.subcategory ?? null,
      color: product.color ?? '',
      colors: product.colors ?? [],
      material: product.material ?? null,
      fit: product.fit ?? null,
      silhouette: product.silhouette ?? null,
      style_tags: product.style_tags ?? [],
      aesthetic_tags: product.aesthetic_tags ?? [],
      occasion_tags: product.occasion_tags ?? [],
      ...(visual ? { visual } : {}),
    });
  }
  return catalog;
}
