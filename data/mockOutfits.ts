import type { Occasion, Outfit, Product, Style } from '@/types';

const productCatalog: Record<Style, Product[]> = {
  Streetwear: [
    {
      id: 'st-1',
      name: 'Oversized Black Tee',
      price: 24.99,
      imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80',
      category: 'top',
    },
    {
      id: 'st-2',
      name: 'Relaxed Cargo Pants',
      price: 34.99,
      imageUrl: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600&q=80',
      category: 'bottom',
    },
    {
      id: 'st-3',
      name: 'Chunky Sneakers',
      price: 39.99,
      imageUrl: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&q=80',
      category: 'footwear',
    },
    {
      id: 'st-4',
      name: 'Graphic Cap',
      price: 18.0,
      imageUrl: 'https://images.unsplash.com/photo-1588850561407-ed78ebb37fb5?w=600&q=80',
      category: 'accessory',
    },
  ],
  Y2K: [
    {
      id: 'y2k-1',
      name: 'Baby Tee',
      price: 22.0,
      imageUrl: 'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=600&q=80',
      category: 'top',
    },
    {
      id: 'y2k-2',
      name: 'Low-Rise Micro Skirt',
      price: 28.5,
      imageUrl: 'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=600&q=80',
      category: 'bottom',
    },
    {
      id: 'y2k-3',
      name: 'Platform Sandals',
      price: 36.0,
      imageUrl: 'https://images.unsplash.com/photo-1543163521-1bf726b0a4d5?w=600&q=80',
      category: 'footwear',
    },
    {
      id: 'y2k-4',
      name: 'Tiny Shoulder Bag',
      price: 19.99,
      imageUrl: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80',
      category: 'accessory',
    },
  ],
  'Old Money': [
    {
      id: 'om-1',
      name: 'Cashmere Crew Knit',
      price: 58.0,
      imageUrl: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600&q=80',
      category: 'top',
    },
    {
      id: 'om-2',
      name: 'Tailored Trousers',
      price: 64.0,
      imageUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&q=80',
      category: 'bottom',
    },
    {
      id: 'om-3',
      name: 'Leather Loafers',
      price: 72.0,
      imageUrl: 'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=600&q=80',
      category: 'footwear',
    },
    {
      id: 'om-4',
      name: 'Silk Scarf',
      price: 24.0,
      imageUrl: 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=600&q=80',
      category: 'accessory',
    },
  ],
  Minimalist: [
    {
      id: 'min-1',
      name: 'Soft Boxy Tee',
      price: 28.0,
      imageUrl: 'https://images.unsplash.com/photo-1523381213477-4d4d0fa47748?w=600&q=80',
      category: 'top',
    },
    {
      id: 'min-2',
      name: 'Wide Leg Trousers',
      price: 42.0,
      imageUrl: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=600&q=80',
      category: 'bottom',
    },
    {
      id: 'min-3',
      name: 'Clean Leather Sneakers',
      price: 48.0,
      imageUrl: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=600&q=80',
      category: 'footwear',
    },
  ],
  Preppy: [
    {
      id: 'prep-1',
      name: 'Oxford Button-Down',
      price: 36.0,
      imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&q=80',
      category: 'top',
    },
    {
      id: 'prep-2',
      name: 'Pleated Chinos',
      price: 44.0,
      imageUrl: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600&q=80',
      category: 'bottom',
    },
    {
      id: 'prep-3',
      name: 'Boat Shoes',
      price: 52.0,
      imageUrl: 'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=600&q=80',
      category: 'footwear',
    },
  ],
  Athleisure: [
    {
      id: 'ath-1',
      name: 'Cropped Performance Top',
      price: 26.0,
      imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80',
      category: 'top',
    },
    {
      id: 'ath-2',
      name: 'Sculpt Leggings',
      price: 38.0,
      imageUrl: 'https://images.unsplash.com/photo-1506629082955-511b1aa78283?w=600&q=80',
      category: 'bottom',
    },
    {
      id: 'ath-3',
      name: 'Lightweight Trainers',
      price: 45.0,
      imageUrl: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=600&q=80',
      category: 'footwear',
    },
  ],
  Casual: [
    {
      id: 'cas-1',
      name: 'Washed Denim Jacket',
      price: 48.0,
      imageUrl: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=600&q=80',
      category: 'outerwear',
    },
    {
      id: 'cas-2',
      name: 'Everyday Tee',
      price: 18.0,
      imageUrl: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=600&q=80',
      category: 'top',
    },
    {
      id: 'cas-3',
      name: 'Straight Jeans',
      price: 39.0,
      imageUrl: 'https://images.unsplash.com/photo-1542272454315-4c01d7ab1324?w=600&q=80',
      category: 'bottom',
    },
    {
      id: 'cas-4',
      name: 'Classic White Sneakers',
      price: 42.0,
      imageUrl: 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=600&q=80',
      category: 'footwear',
    },
  ],
  Formal: [
    {
      id: 'for-1',
      name: 'Structured Blazer',
      price: 89.0,
      imageUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&q=80',
      category: 'outerwear',
    },
    {
      id: 'for-2',
      name: 'Silk Camisole',
      price: 34.0,
      imageUrl: 'https://images.unsplash.com/photo-1564257631407-4deb1f99d992?w=600&q=80',
      category: 'top',
    },
    {
      id: 'for-3',
      name: 'Tailored Trousers',
      price: 56.0,
      imageUrl: 'https://images.unsplash.com/photo-1506629082955-511b1aa78283?w=600&q=80',
      category: 'bottom',
    },
    {
      id: 'for-4',
      name: 'Pointed Heels',
      price: 62.0,
      imageUrl: 'https://images.unsplash.com/photo-1543163521-1bf726b0a4d5?w=600&q=80',
      category: 'footwear',
    },
  ],
  'Clean Girl': [
    {
      id: 'cg-1',
      name: 'Soft Rib Tank',
      price: 22.0,
      imageUrl: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600&q=80',
      category: 'top',
    },
    {
      id: 'cg-2',
      name: 'Linen Wide Pants',
      price: 46.0,
      imageUrl: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=600&q=80',
      category: 'bottom',
    },
    {
      id: 'cg-3',
      name: 'Ballet Flats',
      price: 38.0,
      imageUrl: 'https://images.unsplash.com/photo-1543163521-1bf726b0a4d5?w=600&q=80',
      category: 'footwear',
    },
    {
      id: 'cg-4',
      name: 'Gold Hoops',
      price: 16.0,
      imageUrl: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
      category: 'accessory',
    },
  ],
  Grunge: [
    {
      id: 'gr-1',
      name: 'Distressed Band Tee',
      price: 26.0,
      imageUrl: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600&q=80',
      category: 'top',
    },
    {
      id: 'gr-2',
      name: 'Ripped Black Jeans',
      price: 44.0,
      imageUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f1039?w=600&q=80',
      category: 'bottom',
    },
    {
      id: 'gr-3',
      name: 'Combat Boots',
      price: 58.0,
      imageUrl: 'https://images.unsplash.com/photo-1520639888713-7851133b1ed0?w=600&q=80',
      category: 'footwear',
    },
    {
      id: 'gr-4',
      name: 'Flannel Shirt',
      price: 32.0,
      imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&q=80',
      category: 'outerwear',
    },
  ],
};

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

function selectProductsForBudget(products: Product[], budget: number): Product[] {
  const ordered = [...products].sort((a, b) => a.price - b.price);
  const picks: Product[] = [];
  let running = 0;

  for (const product of ordered) {
    if (picks.length >= 3) break;
    if (running + product.price <= budget) {
      picks.push(product);
      running += product.price;
    }
  }

  if (picks.length < 2) {
    return ordered.slice(0, Math.min(3, ordered.length));
  }

  return picks;
}

export function buildMockOutfit(
  style: Style,
  occasion: Occasion,
  budget: number,
): Outfit {
  const catalog = productCatalog[style];
  const products = selectProductsForBudget(catalog, budget);
  const total = roundPrice(products.reduce((sum, item) => sum + item.price, 0));

  return {
    id: `${style}-${occasion}-${budget}`.toLowerCase().replace(/\s+/g, '-'),
    name: outfitNames[style],
    style,
    occasion,
    products,
    total,
    explanation: explanations[style],
  };
}
