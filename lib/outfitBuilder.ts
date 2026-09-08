import type { Occasion, Outfit as UiOutfit, Product as UiProduct, Style } from '@/types';
import type { Product as DbProduct, ProductCategory } from '@/types/database';

/** Map DB shoes → existing UI footwear category without redesigning screens. */
export function toUiCategory(
  category: ProductCategory,
): UiProduct['category'] {
  if (category === 'shoes') return 'footwear';
  return category;
}

export function toUiProduct(product: DbProduct): UiProduct {
  return {
    id: product.id,
    name: product.name,
    price: Number(product.price),
    imageUrl: product.image_url,
    category: toUiCategory(product.category),
  };
}

export function styleToTag(style: Style): string {
  return style.toLowerCase();
}

export function occasionToTag(occasion: Occasion): string {
  return occasion.toLowerCase();
}

const outfitNames: Record<Style, string> = {
  Streetwear: 'Downtown Streetwear',
  Y2K: 'Y2K Flash',
  'Old Money': 'Quiet Luxury Set',
  Minimalist: 'Soft Minimal Edit',
  Preppy: 'Campus Prep',
  Athleisure: 'Move-All-Day Set',
  Casual: 'Weekend Easy',
  Formal: 'Evening Tailored',
  'Clean Girl': 'Clean Girl Soft',
  Grunge: 'After Dark Grunge',
};

const explanations: Record<Style, string> = {
  Streetwear:
    'This fit balances an oversized silhouette with relaxed bottoms for a clean streetwear look.',
  Y2K: 'Playful proportions and shiny accents keep this look nostalgic without feeling costume-y.',
  'Old Money':
    'Refined textures and polished neutrals create that effortless inherited-style vibe.',
  Minimalist:
    'Clean lines and quiet neutrals keep the outfit elevated with almost no visual noise.',
  Preppy: 'Crisp layers and classic pieces land polished without feeling stuffy.',
  Athleisure:
    'Performance-ready pieces styled soft enough to wear from errands to brunch.',
  Casual: 'Easy denim and everyday basics that still feel intentional together.',
  Formal: 'Sharp structure with soft contrast keeps this look occasion-ready.',
  'Clean Girl':
    'Soft textures, simple jewelry, and airy silhouettes for that polished everyday glow.',
  Grunge: 'Worn-in textures and darker pieces build attitude without overdoing it.',
};

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

export function selectProductsForBudget(
  products: DbProduct[],
  budget: number,
): DbProduct[] {
  const preferredOrder: ProductCategory[] = [
    'top',
    'bottom',
    'shoes',
    'outerwear',
    'accessory',
  ];

  const byCategory = preferredOrder
    .map((category) =>
      products
        .filter((product) => product.category === category)
        .sort((a, b) => Number(a.price) - Number(b.price))[0],
    )
    .filter((product): product is DbProduct => Boolean(product));

  const picks: DbProduct[] = [];
  let running = 0;

  for (const product of byCategory) {
    if (picks.length >= 3) break;
    const price = Number(product.price);
    if (running + price <= budget) {
      picks.push(product);
      running += price;
    }
  }

  if (picks.length < 2) {
    return [...products]
      .sort((a, b) => Number(a.price) - Number(b.price))
      .slice(0, Math.min(3, products.length));
  }

  return picks;
}

export function buildUiOutfit(params: {
  style: Style;
  occasion: Occasion;
  budget: number;
  products: DbProduct[];
}): UiOutfit {
  const selected = selectProductsForBudget(params.products, params.budget);
  const uiProducts = selected.map(toUiProduct);
  const total = roundPrice(
    uiProducts.reduce((sum, item) => sum + item.price, 0),
  );

  return {
    id: `${params.style}-${params.occasion}-${params.budget}`
      .toLowerCase()
      .replace(/\s+/g, '-'),
    name: outfitNames[params.style],
    style: params.style,
    occasion: params.occasion,
    products: uiProducts,
    total,
    explanation: explanations[params.style],
  };
}
