/**
 * Deterministic CatalogProduct fixtures for handler integration tests.
 * Not a second catalog implementation — only test data.
 */
import { emptyVisualAttributes, type VisualAttributes } from '../_shared/catalog/visualAttributes.ts';
import type { CatalogProduct, ProductCategory } from './catalog.ts';
import { emptyMetadataStats } from './genTrace.ts';
import { countByCategory, type LiveRetrieval } from './liveRetrieval.ts';

export function catalogProduct(
  id: string,
  category: ProductCategory,
  extra: Partial<CatalogProduct> = {},
): CatalogProduct {
  return {
    id,
    name: extra.name ?? `${category} ${id}`,
    brand: extra.brand ?? 'Acme',
    brand_id: extra.brand_id ?? 'brand-acme',
    category,
    subcategory:
      extra.subcategory ??
      (category === 'shoes' ? 'sneakers' : category === 'bottom' ? 'jeans' : 't-shirt'),
    price: extra.price ?? 40,
    currency: 'USD',
    color: extra.color ?? 'black',
    colors: extra.colors ?? [extra.color ?? 'black'],
    material: extra.material ?? 'cotton',
    description: extra.description ?? null,
    gender: extra.gender ?? 'men',
    image_url: extra.image_url ?? `https://cdn.example.com/${id}.jpg`,
    purchase_url: extra.purchase_url ?? `https://shop.example.com/p/${id}`,
    style_tags: extra.style_tags ?? ['streetwear'],
    occasion_tags: extra.occasion_tags ?? ['everyday'],
    aesthetic_tags: extra.aesthetic_tags ?? [],
    season_tags: extra.season_tags ?? [],
    fit: extra.fit ?? null,
    silhouette: extra.silhouette ?? null,
    pattern: extra.pattern ?? null,
    formality: extra.formality ?? null,
    source: extra.source ?? 'channel3',
    visual_attributes: extra.visual_attributes,
  };
}

export function usableVisual(partial: Partial<VisualAttributes> = {}): VisualAttributes {
  return {
    ...emptyVisualAttributes(0.9),
    primary_color: 'navy',
    color_family: 'blue',
    fit: 'oversized',
    silhouette: 'boxy',
    visual_intensity: 7,
    aesthetics: ['streetwear'],
    ...partial,
  };
}

export function coreCatalog(): CatalogProduct[] {
  return [
    catalogProduct('top-1', 'top', {
      name: 'Streetwear Graphic Tee',
      style_tags: ['streetwear', 'graphic'],
      brand: 'Acme',
    }),
    catalogProduct('top-2', 'top', {
      name: 'Streetwear Heavyweight Tee',
      style_tags: ['streetwear'],
      brand: 'Bolt',
      price: 45,
    }),
    catalogProduct('bottom-1', 'bottom', {
      name: 'Streetwear Cargo Pants',
      style_tags: ['streetwear', 'cargo'],
      subcategory: 'cargo',
    }),
    catalogProduct('bottom-2', 'bottom', {
      name: 'Streetwear Baggy Jeans',
      style_tags: ['streetwear', 'baggy'],
      brand: 'Bolt',
      price: 55,
    }),
    catalogProduct('shoes-1', 'shoes', {
      name: 'Streetwear Chunk Sneakers',
      style_tags: ['streetwear', 'sneaker'],
    }),
    catalogProduct('shoes-2', 'shoes', {
      name: 'Everyday Court Sneakers',
      style_tags: ['streetwear'],
      brand: 'Bolt',
      price: 50,
    }),
  ];
}

export function expensiveVisualTops(): CatalogProduct[] {
  const tops = Array.from({ length: 8 }, (_, index) =>
    catalogProduct(`top-pool-${index + 1}`, 'top', {
      name: `Streetwear Tee ${index + 1}`,
      style_tags: ['streetwear'],
      price: 30 + index,
    }),
  );
  tops[7] = catalogProduct('top-visual-star', 'top', {
    name: 'Streetwear Tee 8',
    style_tags: ['streetwear'],
    price: 80,
  });
  return [
    ...tops,
    catalogProduct('bottom-1', 'bottom', { name: 'Streetwear Cargo Pants', style_tags: ['streetwear', 'cargo'] }),
    catalogProduct('shoes-1', 'shoes', { name: 'Streetwear Chunk Sneakers', style_tags: ['streetwear'] }),
  ];
}

export function liveRetrievalOf(products: CatalogProduct[], extra: Partial<LiveRetrieval> = {}): LiveRetrieval {
  return {
    attempted: true,
    ok: extra.ok ?? true,
    reason: extra.reason ?? 'successful',
    products,
    fetched: extra.fetched ?? products.length,
    queryCount: extra.queryCount ?? 5,
    usable: extra.usable ?? products.length,
    categories: extra.categories ?? countByCategory(products),
    unresolvedBrands: extra.unresolvedBrands ?? [],
    timedOut: extra.timedOut ?? false,
    metadata: extra.metadata ?? emptyMetadataStats(),
  };
}

export function geminiPayload(text: string): unknown {
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text }] },
      },
    ],
  };
}

export function outfitCandidateJson(input: {
  top: string;
  bottom: string;
  shoes?: string | null;
  name?: string;
}): string {
  return JSON.stringify({
    outfit_name: input.name ?? 'Test Look',
    styling_tip: 'Keep it simple.',
    candidates: [
      {
        top_id: input.top,
        bottom_id: input.bottom,
        shoes_id: input.shoes === undefined ? 'shoes-1' : input.shoes,
        outerwear_id: null,
        accessory_id: null,
        reason: 'Handler integration fixture.',
      },
    ],
  });
}
