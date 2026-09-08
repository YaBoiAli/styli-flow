/**
 * Generates supabase/seed.sql with 100+ realistic Styli products.
 * Run: node scripts/generate-product-seed.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = [
  'streetwear',
  'y2k',
  'old money',
  'minimalist',
  'preppy',
  'athleisure',
  'casual',
  'formal',
  'clean girl',
  'grunge',
];

const occasions = [
  'everyday',
  'date',
  'party',
  'school',
  'work',
  'vacation',
  'event',
  'night out',
];

const brands = [
  'Aether',
  'Noir Lane',
  'Soft Form',
  'Civic Thread',
  'Lumen',
  'Ridge & Co',
  'Velvet Arc',
  'Studio Nine',
  'Harbor Knit',
  'Pulse Wear',
];

/** Stable Unsplash fashion placeholders — replace later with CDN assets. */
const imagePools = {
  top: [
    'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&q=80',
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80',
    'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=800&q=80',
    'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800&q=80',
    'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80',
    'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800&q=80',
  ],
  bottom: [
    'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&q=80',
    'https://images.unsplash.com/photo-1542272454315-4c01d7ab1324?w=800&q=80',
    'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800&q=80',
    'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=80',
    'https://images.unsplash.com/photo-1541099649105-f69ad21f1039?w=800&q=80',
    'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=800&q=80',
  ],
  shoes: [
    'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80',
    'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&q=80',
    'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=800&q=80',
    'https://images.unsplash.com/photo-1543163521-1bf726b0a4d5?w=800&q=80',
    'https://images.unsplash.com/photo-1520639888713-7851133b1ed0?w=800&q=80',
    'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=800&q=80',
  ],
  outerwear: [
    'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800&q=80',
    'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&q=80',
    'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=800&q=80',
    'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=80',
  ],
  accessory: [
    'https://images.unsplash.com/photo-1588850561407-ed78ebb37fb5?w=800&q=80',
    'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=80',
    'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&q=80',
    'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=800&q=80',
  ],
};

const catalog = {
  streetwear: {
    colors: ['Black', 'Olive', 'Graphite', 'Bone'],
    tops: ['Oversized Graphic Tee', 'Boxy Hoodie', 'Tech Fleece Crew', 'Drop-Shoulder Jersey'],
    bottoms: ['Relaxed Cargo Pants', 'Baggy Denim', 'Parachute Pants', 'Wide Track Pants'],
    shoes: ['Chunky Sneakers', 'Skate Lows', 'High-Top Trainers'],
    outerwear: ['Utility Windbreaker', 'Oversized Bomber'],
    accessories: ['Graphic Cap', 'Crossbody Sling', 'Beanie'],
    occasions: ['everyday', 'school', 'party', 'night out'],
    price: [18, 95],
  },
  y2k: {
    colors: ['Hot Pink', 'Silver', 'Lilac', 'White'],
    tops: ['Baby Tee', 'Halter Crop', 'Mesh Long Sleeve', 'Butterfly Tank'],
    bottoms: ['Low-Rise Micro Skirt', 'Cargo Mini', 'Flare Denim', 'Shiny Capris'],
    shoes: ['Platform Sandals', 'Chunky Mary Janes', 'Metallic Sneakers'],
    outerwear: ['Faux Fur Shrug', 'Cropped Puffer'],
    accessories: ['Tiny Shoulder Bag', 'Star Choker', 'Tinted Mini Specs'],
    occasions: ['party', 'night out', 'date', 'event'],
    price: [12, 70],
  },
  'old money': {
    colors: ['Camel', 'Ivory', 'Navy', 'Forest'],
    tops: ['Cashmere Crew Knit', 'Silk Button-Down', 'Fine Merino Polo', 'Cable Knit Vest'],
    bottoms: ['Tailored Trousers', 'Pleated Wool Pants', 'High-Rise Chinos'],
    shoes: ['Leather Loafers', 'Suede Horsebit', 'Cap-Toe Oxfords'],
    outerwear: ['Camel Overcoat', 'Structured Blazer'],
    accessories: ['Silk Scarf', 'Leather Belt', 'Gold Signet'],
    occasions: ['work', 'event', 'date', 'vacation'],
    price: [42, 150],
  },
  minimalist: {
    colors: ['White', 'Stone', 'Black', 'Taupe'],
    tops: ['Soft Boxy Tee', 'Relaxed Oxford', 'Seamless Tank', 'Clean Mock Neck'],
    bottoms: ['Wide Leg Trousers', 'Straight Soft Denim', 'Column Pants'],
    shoes: ['Clean Leather Sneakers', 'Minimal Slip-Ons', 'Soft Ballet Flats'],
    outerwear: ['Unlined Overshirt', 'Longline Wool Coat'],
    accessories: ['Slim Leather Tote', 'Matte Hoops', 'Canvas Cap'],
    occasions: ['everyday', 'work', 'vacation', 'school'],
    price: [20, 120],
  },
  preppy: {
    colors: ['Navy', 'Cream', 'Burgundy', 'Sky'],
    tops: ['Oxford Button-Down', 'Striped Rugby', 'Cable Sweater', 'Piqué Polo'],
    bottoms: ['Pleated Chinos', 'Pleated Skirt', 'Straight Khakis'],
    shoes: ['Boat Shoes', 'White Court Sneakers', 'Penny Loafers'],
    outerwear: ['Varsity Jacket', 'Trench Coat'],
    accessories: ['Canvas Tote', 'Ribbon Hair Clip', 'Leather Watch'],
    occasions: ['school', 'work', 'everyday', 'event'],
    price: [22, 130],
  },
  athleisure: {
    colors: ['Black', 'Heather Grey', 'Sage', 'Navy'],
    tops: ['Cropped Performance Top', 'Seamless Long Sleeve', 'Zip Training Tee'],
    bottoms: ['Sculpt Leggings', 'Running Shorts', 'Tapered Joggers'],
    shoes: ['Lightweight Trainers', 'Knit Runners', 'Trail Cross-Trainers'],
    outerwear: ['Softshell Jacket', 'Packable Puffer'],
    accessories: ['Sport Belt Bag', 'Performance Cap', 'Sweat Towel Band'],
    occasions: ['everyday', 'vacation', 'school'],
    price: [16, 110],
  },
  casual: {
    colors: ['Blue', 'White', 'Sand', 'Charcoal'],
    tops: ['Everyday Tee', 'Henley', 'Flannel Shirt', 'Relaxed Knit'],
    bottoms: ['Straight Jeans', 'Chino Shorts', 'Easy Drawstring Pants'],
    shoes: ['Classic White Sneakers', 'Suede Slip-Ons', 'Canvas Lows'],
    outerwear: ['Washed Denim Jacket', 'Quilted Shirt Jacket'],
    accessories: ['Everyday Backpack', 'Simple Beanie', 'Canvas Belt'],
    occasions: ['everyday', 'school', 'vacation', 'date'],
    price: [12, 90],
  },
  formal: {
    colors: ['Black', 'Champagne', 'Charcoal', 'Deep Red'],
    tops: ['Silk Camisole', 'Crisp Dress Shirt', 'Satin Blouse'],
    bottoms: ['Tailored Trousers', 'Column Skirt', 'Tuxedo Pants'],
    shoes: ['Pointed Heels', 'Patent Oxfords', 'Strappy Evening Sandals'],
    outerwear: ['Structured Blazer', 'Evening Wrap Coat'],
    accessories: ['Clutch', 'Pearl Studs', 'Silk Pocket Square'],
    occasions: ['work', 'event', 'night out', 'date'],
    price: [34, 150],
  },
  'clean girl': {
    colors: ['Butter', 'White', 'Soft Brown', 'Blush'],
    tops: ['Soft Rib Tank', 'Butter Tee', 'Slim Mock Neck'],
    bottoms: ['Linen Wide Pants', 'Soft Foldover Pants', 'Clean Straight Jeans'],
    shoes: ['Ballet Flats', 'Clean Court Sneakers', 'Soft Mules'],
    outerwear: ['Lightweight Cardigan', 'Soft Trench'],
    accessories: ['Gold Hoops', 'Slick Claw Clip', 'Mini Shoulder Bag'],
    occasions: ['everyday', 'school', 'date', 'vacation'],
    price: [15, 98],
  },
  grunge: {
    colors: ['Black', 'Washed Red', 'Charcoal', 'Moss'],
    tops: ['Distressed Band Tee', 'Thermal Long Sleeve', 'Washed Muscle Tank'],
    bottoms: ['Ripped Black Jeans', 'Plaid Pants', 'Destroyed Denim'],
    shoes: ['Combat Boots', 'Worn Skate Shoes', 'Chunky Platform Boots'],
    outerwear: ['Flannel Shirt', 'Leather Moto Jacket'],
    accessories: ['Chain Necklace', 'Studded Belt', 'Beanie'],
    occasions: ['everyday', 'party', 'night out', 'school'],
    price: [16, 125],
  },
};

function uuidFromSeed(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function priceInRange([min, max], index, category) {
  const span = max - min;
  let value = min + ((index * 17) % Math.floor(span + 1));
  // Keep core pieces affordable enough for common Stage 3 budgets ($75/$100).
  if (category === 'shoes') value = Math.min(value, min + Math.floor(span * 0.45));
  if (category === 'bottom') value = Math.min(value, min + Math.floor(span * 0.55));
  if (category === 'top') value = Math.min(value, min + Math.floor(span * 0.5));
  return Math.min(max, Math.max(min, Number(value.toFixed(2))));
}

function sqlArray(values) {
  return `ARRAY[${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')}]::text[]`;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const products = [];

for (const style of styles) {
  const cfg = catalog[style];
  const pushItem = (category, names, startIndex) => {
    names.forEach((name, i) => {
      const idx = startIndex + i;
      const color = cfg.colors[idx % cfg.colors.length];
      const brand = brands[(idx + style.length) % brands.length];
      const image = imagePools[category][idx % imagePools[category].length];
      const styleTags = [style];
      // lightly cross-tag adjacent aesthetics for richer filtering
      if (i % 3 === 0) {
        const neighbor = styles[(styles.indexOf(style) + 1) % styles.length];
        styleTags.push(neighbor);
      }
      const occasionTags = cfg.occasions.slice(0, 3 + (i % 2));
      products.push({
        id: uuidFromSeed(`${style}-${category}-${name}`),
        name: `${color} ${name}`,
        brand,
        category,
        price: priceInRange(cfg.price, idx, category),
        color,
        image_url: image,
        purchase_url: `https://example.com/products/${style.replace(/\s+/g, '-')}/${category}/${idx + 1}`,
        style_tags: styleTags,
        occasion_tags: occasionTags,
      });
    });
  };

  pushItem('top', cfg.tops, 0);
  pushItem('bottom', cfg.bottoms, 10);
  pushItem('shoes', cfg.shoes, 20);
  pushItem('outerwear', cfg.outerwear, 30);
  pushItem('accessory', cfg.accessories, 40);
}

if (products.length < 100) {
  throw new Error(`Expected at least 100 products, got ${products.length}`);
}

const values = products
  .map((p) => {
    return `(${sqlString(p.id)}, ${sqlString(p.name)}, ${sqlString(p.brand)}, ${sqlString(p.category)}, ${p.price}, ${sqlString(p.color)}, ${sqlString(p.image_url)}, ${sqlString(p.purchase_url)}, ${sqlArray(p.style_tags)}, ${sqlArray(p.occasion_tags)})`;
  })
  .join(',\n  ');

const sql = `-- Styli product catalog seed (${products.length} products)
-- Image URLs are temporary Unsplash placeholders for development.
-- Replace image_url / purchase_url later with production CDN + retailer links.

truncate table public.outfit_items cascade;
truncate table public.outfits cascade;
truncate table public.products cascade;

insert into public.products (
  id,
  name,
  brand,
  category,
  price,
  color,
  image_url,
  purchase_url,
  style_tags,
  occasion_tags
) values
  ${values};
`;

const outSql = path.join(__dirname, '..', 'supabase', 'seed.sql');
fs.writeFileSync(outSql, sql);

const outJson = path.join(__dirname, '..', 'data', 'product-seed.json');
fs.writeFileSync(outJson, JSON.stringify(products, null, 2));

console.log(`Wrote ${products.length} products to:`);
console.log(`- ${outSql}`);
console.log(`- ${outJson}`);
