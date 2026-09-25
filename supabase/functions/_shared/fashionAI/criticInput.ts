import type { FashionCriticProduct, FashionRevisionCatalogProduct } from './types.ts';

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
    };
  });
}

export function criticImageUrls(products: FashionCriticProduct[]): string[] {
  return products
    .filter((product) => product.image_available && product.image_url)
    .map((product) => product.image_url as string);
}

/** Slim candidate-pool metadata for revision. No image URLs (token control). */
export function revisionCatalogFromProducts(
  products: CatalogLike[],
): FashionRevisionCatalogProduct[] {
  return products.map((product) => ({
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
  }));
}
