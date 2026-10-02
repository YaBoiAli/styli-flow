import type { Outfit, PreviousOutfitProduct, Product } from '../types';

/**
 * Snapshot the last successful outfit for rebuild exclusion.
 * Uses existing product IDs — no extra persistence.
 */
export function snapshotOutfitForRebuild(outfit: Outfit): PreviousOutfitProduct[] {
  return outfit.products.map((product) => snapshotProductForRebuild(product));
}

export function snapshotProductForRebuild(product: Product): PreviousOutfitProduct {
  return {
    productId: product.id,
    name: product.name,
    ...(product.brand ? { brand: product.brand } : {}),
    category: (product.category === 'footwear' ? 'shoes' : product.category) as PreviousOutfitProduct['category'],
    ...(product.color ? { color: product.color } : {}),
  };
}

/** IDs actually present on the previous outfit. Never invents a shoe ID. */
export function excludeProductIdsFromPrevious(previous: PreviousOutfitProduct[]): string[] {
  return previous
    .map((item) => item.productId)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

/**
 * Failed generation must not wipe the last successful rebuild reference.
 * Only a new successful outfit replaces the snapshot.
 */
export function nextRebuildSnapshot(
  lastSuccessful: PreviousOutfitProduct[],
  generatedOutfit: Outfit | null,
): PreviousOutfitProduct[] {
  if (generatedOutfit) return snapshotOutfitForRebuild(generatedOutfit);
  return lastSuccessful;
}
