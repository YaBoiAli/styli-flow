import type {
  Availability,
  NormalizedProduct,
  ProductCategory,
  ProductFilters,
  ProductGender,
} from './types.ts';

type CategoryRule = { category: ProductCategory; subcategory: string; pattern: RegExp };

// Order matters: specific outerwear/shoe terms win over generic top/bottom words.
const CATEGORY_RULES: CategoryRule[] = [
  { category: 'shoes', subcategory: 'sneakers', pattern: /\b(sneakers?|trainers?|runners?|running shoes?|skate shoes?|high[- ]tops?|low[- ]tops?)\b/ },
  { category: 'shoes', subcategory: 'boots', pattern: /\b(boots?|chelsea|combat boots?)\b/ },
  { category: 'shoes', subcategory: 'loafers', pattern: /\b(loafers?|oxfords?|derbys?|brogues?|dress shoes?)\b/ },
  { category: 'shoes', subcategory: 'sandals', pattern: /\b(sandals?|slides?|flip[- ]flops?|mules?|clogs?|espadrilles?)\b/ },
  { category: 'shoes', subcategory: 'heels', pattern: /\b(heels?|pumps?|stilettos?)\b/ },
  { category: 'shoes', subcategory: 'shoes', pattern: /\b(shoes?|footwear)\b/ },
  { category: 'outerwear', subcategory: 'puffer', pattern: /\b(puffers?|down jackets?|parkas?)\b/ },
  { category: 'outerwear', subcategory: 'coat', pattern: /\b(coats?|trench|overcoats?|peacoats?)\b/ },
  { category: 'outerwear', subcategory: 'blazer', pattern: /\b(blazers?|sport coats?|suit jackets?)\b/ },
  { category: 'outerwear', subcategory: 'vest', pattern: /\b(vests?|gilets?)\b/ },
  { category: 'outerwear', subcategory: 'jacket', pattern: /\b(jackets?|bombers?|windbreakers?|anoraks?|shackets?|overshirts?|shirt jackets?)\b/ },
  { category: 'bottom', subcategory: 'jeans', pattern: /\b(jeans?|denim pants?)\b/ },
  { category: 'bottom', subcategory: 'shorts', pattern: /\b(shorts)\b/ },
  { category: 'bottom', subcategory: 'skirt', pattern: /\b(skirts?|skorts?)\b/ },
  { category: 'bottom', subcategory: 'joggers', pattern: /\b(joggers?|sweatpants?|track pants?)\b/ },
  { category: 'bottom', subcategory: 'leggings', pattern: /\b(leggings?|tights)\b/ },
  { category: 'bottom', subcategory: 'pants', pattern: /\b(pants?|trousers?|chinos?|cargos?|slacks|culottes?)\b/ },
  { category: 'top', subcategory: 'hoodie', pattern: /\b(hoodies?|hooded sweatshirts?)\b/ },
  { category: 'top', subcategory: 'sweatshirt', pattern: /\b(sweatshirts?|crewnecks?|pullovers?|quarter[- ]zips?|half[- ]zips?)\b/ },
  { category: 'top', subcategory: 'sweater', pattern: /\b(sweaters?|knits?|knitwear|cardigans?|turtlenecks?|jumpers?)\b/ },
  { category: 'top', subcategory: 'polo', pattern: /\b(polos?|rugby shirts?)\b/ },
  { category: 'top', subcategory: 't-shirt', pattern: /\b(t-shirts?|tee shirts?|tees?|tshirts?|long ?sleeves?)\b/ },
  { category: 'top', subcategory: 'tank', pattern: /\b(tanks?|tank tops?|camis?|camisoles?)\b/ },
  { category: 'top', subcategory: 'shirt', pattern: /\b(shirts?|button[- ]downs?|button[- ]ups?|blouses?|flannels?|henleys?|jerseys?)\b/ },
  { category: 'top', subcategory: 'top', pattern: /\b(tops?|bodysuits?|crop tops?)\b/ },
  { category: 'accessory', subcategory: 'headwear', pattern: /\b(hats?|caps?|beanies?|bucket hats?|headwear)\b/ },
  { category: 'accessory', subcategory: 'bag', pattern: /\b(bags?|backpacks?|totes?|crossbody|duffels?|wallets?)\b/ },
  { category: 'accessory', subcategory: 'belt', pattern: /\b(belts?)\b/ },
  { category: 'accessory', subcategory: 'jewelry', pattern: /\b(necklaces?|bracelets?|rings?|earrings?|chains?|jewelry|jewellery)\b/ },
  { category: 'accessory', subcategory: 'eyewear', pattern: /\b(sunglasses|eyewear)\b/ },
  { category: 'accessory', subcategory: 'accessory', pattern: /\b(scarf|scarves|gloves?|socks?|watches?|bandanas?)\b/ },
];

// Not part of an adult outfit, or not clothing at all.
const EXCLUDE_PATTERN =
  /\b(gift ?cards?|e-?gift|insurance|(package|shipping|return|returns|order|route) (protection|coverage)|returns? coverage|warranty|shipping|donations?|stickers?|posters?|candles?|mugs?|home goods|kids?|toddlers?|baby|babies|infants?|youth|boys|girls|grade school|preschool|little kids|big kids|underwear|boxers?|briefs|bras?|lingerie|swim ?trunks?|swimsuits?|bikinis?|shoe ?laces|laces|insoles?|cleaners?|shoe care|mystery box|scrubs?|lab ?coats?|medical uniforms?|pillows?|blankets?|throws?|towels?|tools?|knife|knives|organizers?|tape tether|pet|dogs?|plush|umbrellas?|keychains?|key ?rings?|water ?bottles?|tumblers?|phone ?cases?)\b/;
const STRONG_TAG_EXCLUDE = /\b(gift ?cards?|kids|youth|toddler|baby|infant|grade school|preschool)\b/;

// Phrases that contain category words but mean something else.
const MISLEADING_PHRASES = /\b(boot ?cut|boot-cut|tee ?shirt dress|shirt ?dress|t-shirt dress|sweater dress|jacket included)\b/g;

const DRESS_PATTERN = /\b(dress|dresses|jumpsuits?|rompers?|overalls?)\b/;

export function classifyCategory(
  productType: string | null | undefined,
  title: string,
  tags: string[] = [],
): { category: ProductCategory; subcategory: string } | null {
  const sources = [productType ?? '', title, tags.join(' ')];
  const primary = `${productType ?? ''} ${title}`.toLowerCase();
  if (EXCLUDE_PATTERN.test(primary)) return null;
  if (tags.some((tag) => STRONG_TAG_EXCLUDE.test(tag.toLowerCase()))) return null;

  for (const raw of sources) {
    const text = raw.toLowerCase().replace(MISLEADING_PHRASES, ' ');
    if (!text.trim()) continue;
    // Dresses/one-pieces don't fit the top + bottom + shoes outfit model yet.
    if (DRESS_PATTERN.test(text)) return null;
    for (const rule of CATEGORY_RULES) {
      if (rule.pattern.test(text)) {
        return { category: rule.category, subcategory: rule.subcategory };
      }
    }
  }
  return null;
}

const WOMEN_GARMENT =
  /\b(skirts?|skorts?|dresses?|gowns?|blouses?|baby[- ]tees?|crop(?:ped)?[- ]tops?|halters?|camisoles?|bodysuits?|leotards?|bralettes?|heels?|pumps?|stilettos?|mary[- ]janes?|kitten[- ]heels?|ballet[- ]flats?|mini[- ]skirts?|micro[- ]skirts?)\b/;

export function detectGender(...texts: Array<string | null | undefined>): ProductGender | null {
  const text = texts.filter(Boolean).join(' ').toLowerCase();
  if (WOMEN_GARMENT.test(text)) return 'women';
  if (/\bunisex\b|\ball genders?\b|\bgender[- ]neutral\b/.test(text)) return 'unisex';
  const men = /\b(men|mens|men's|man|male|guys|homme)\b/.test(text);
  const women = /\b(women|womens|women's|woman|female|ladies|femme|womenswear)\b/.test(text);
  if (men && women) return 'unisex';
  if (men) return 'men';
  if (women) return 'women';
  return null;
}

const MATERIAL_WORDS = [
  'organic cotton', 'cotton', 'polyester', 'recycled polyester', 'nylon', 'wool', 'merino',
  'cashmere', 'linen', 'silk', 'leather', 'suede', 'denim', 'fleece', 'spandex', 'elastane',
  'viscose', 'rayon', 'modal', 'lyocell', 'tencel', 'acrylic', 'canvas', 'corduroy',
];

export function detectMaterial(...texts: Array<string | null | undefined>): string | null {
  const text = texts.filter(Boolean).join(' ');
  const composition = text.match(/\b\d{1,3}%\s*[a-z][a-z ]{2,20}(?:[,/&]\s*\d{1,3}%\s*[a-z][a-z ]{2,20})*/i);
  if (composition) return titleCase(composition[0].trim().replace(/\s+/g, ' ')).slice(0, 120);
  const lower = text.toLowerCase();
  const found = MATERIAL_WORDS.filter((word) => new RegExp(`\\b${word}\\b`).test(lower));
  const distinct = found.filter(
    (word) => !found.some((other) => other !== word && other.includes(word)),
  );
  return distinct.length ? distinct.slice(0, 3).map(titleCase).join(', ') : null;
}

export function cleanDescription(html: string | null | undefined, max = 600): string | null {
  if (!html) return null;
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '. ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .replace(/(\.\s*){2,}/g, '. ')
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? round2(value) : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  // "1,299.00" → 1299.00; "29,99" → 29.99
  const normalized = /,\d{2}$/.test(cleaned) && !cleaned.includes('.')
    ? cleaned.replace(',', '.')
    : cleaned.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

export function normalizeAvailability(value: unknown): Availability {
  if (typeof value === 'boolean') return value ? 'in_stock' : 'out_of_stock';
  if (typeof value !== 'string') return 'unknown';
  const v = value.toLowerCase();
  if (/instock|in_stock|in stock|limitedavailability|onlineonly|presale|preorder|^1$|^true$|^yes$/.test(v)) return 'in_stock';
  if (/outofstock|out_of_stock|out of stock|soldout|sold out|^0$|^false$|^no$/.test(v)) return 'out_of_stock';
  if (/discontinued/.test(v)) return 'discontinued';
  return 'unknown';
}

export function uniqueClean(values: Array<string | null | undefined>, max = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = value?.toString().trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key) || /^default title$/i.test(cleaned)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}

export function absoluteUrl(value: unknown, base: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim().startsWith('//') ? `https:${value.trim()}` : value.trim(), base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Final gate: a product only enters the catalog with a real name, price, image and URL. */
export function isValidProduct(product: NormalizedProduct): boolean {
  return (
    product.product_name.trim().length > 1 &&
    Number.isFinite(product.price) &&
    product.price > 0 &&
    /^https?:\/\//.test(product.image_url) &&
    /^https?:\/\//.test(product.product_url) &&
    product.source_product_id.length > 0 &&
    /^[A-Z]{3}$/.test(product.currency)
  );
}

export function matchesFilters(product: NormalizedProduct, filters: ProductFilters): boolean {
  if (filters.category && product.category !== filters.category) return false;
  if (filters.maxPrice !== undefined && product.price > filters.maxPrice) return false;
  if (
    filters.gender &&
    product.gender &&
    product.gender !== 'unisex' &&
    product.gender !== filters.gender
  ) {
    return false;
  }
  return true;
}

export function sameSite(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
