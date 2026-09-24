import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { normalizeDomain } from '../_shared/catalog/domain.ts';
import { freshSince } from '../_shared/catalog/freshness.ts';

export type ProductCategory = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';

export type GenderPreference = 'men' | 'women' | 'any';

export type CatalogProduct = {
  id: string;
  name: string;
  brand: string;
  brand_id: string | null;
  category: ProductCategory;
  subcategory: string | null;
  price: number;
  currency: string;
  color: string;
  colors: string[];
  material: string | null;
  description: string | null;
  gender: 'men' | 'women' | 'unisex' | null;
  image_url: string;
  purchase_url: string;
  style_tags: string[];
  occasion_tags: string[];
  source: string;
};

export type CatalogScope = {
  /** Approved brand names the user picked; empty means No Preference. */
  brandNames: string[];
  /** Custom brands the user added (only used once they're supported). */
  requestedBrands: Array<{ name: string; website: string }>;
};

export type CatalogResult =
  | {
      ok: true;
      products: CatalogProduct[];
      catalogSource: 'live' | 'demo';
      unavailableBrands: string[];
    }
  | { ok: false; code: 'brands_unavailable' | 'catalog_empty' | 'network'; unavailableBrands: string[] };

const CATEGORIES: ProductCategory[] = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'];
const PRODUCT_COLUMNS =
  'id, name, brand, brand_id, category, subcategory, price, currency, color, colors, material, ' +
  'description, gender, image_url, purchase_url, style_tags, occasion_tags, source';
/** Hosted PostgREST caps responses at 1000 rows, so each category is fetched separately. */
const ROWS_PER_CATEGORY = 1000;
/** Budgets are entered in dollars; other currencies would make price checks meaningless. */
const BUDGET_CURRENCY = 'USD';

type BrandLookup = { id: string; name: string; domain: string; status: string };

function genderFilter(gender: GenderPreference): string | null {
  // Null stays in the query because many live rows are untagged; matchesGenderPreference
  // drops women's-coded or men's-coded pieces after we can read the title.
  if (gender === 'men') return 'gender.is.null,gender.in.(men,unisex)';
  if (gender === 'women') return 'gender.is.null,gender.in.(women,unisex)';
  return null;
}

const WOMEN_GARMENT =
  /\b(skirts?|skorts?|dresses?|gowns?|blouses?|baby[- ]tees?|crop(?:ped)?[- ]tops?|halters?|camisoles?|camis?\b|bodysuits?|leotards?|bralettes?|heels?|pumps?|stilettos?|mary[- ]janes?|kitten[- ]heels?|ballet[- ]flats?|wedges?|platform sandals?|micro[- ]skirts?|mini[- ]skirts?|chokers?|shrugs?|hoop earrings?)\b/;
const WOMEN_CONTEXT =
  /\b(women|womens|women['’`s]{0,2}|woman|ladies|femme|womenswear)\b|\/women(?:s)?\//;
const MEN_CONTEXT =
  /\b(men|mens|men['’`s]{0,2}|man|male|guys|homme|menswear)\b|\/men(?:s)?\//;

function hasGenderCue(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

/** Stored gender, or a title/url guess when the row was imported untagged. */
export function inferProductGender(
  product: CatalogProduct,
): 'men' | 'women' | 'unisex' {
  const name = `${product.name} ${product.subcategory ?? ''}`.toLowerCase();
  const extra = `${product.description ?? ''} ${product.purchase_url ?? ''}`.toLowerCase();

  if (
    WOMEN_GARMENT.test(name) ||
    product.subcategory === 'skirt' ||
    product.subcategory === 'heels'
  ) {
    return 'women';
  }

  // The product title wins over a /mens/ slug — Champion and others mix those.
  const nameWomen = hasGenderCue(name, WOMEN_CONTEXT);
  const nameMen = hasGenderCue(name, MEN_CONTEXT);
  if (nameWomen && !nameMen) return 'women';
  if (nameMen && !nameWomen) return 'men';

  if (product.gender === 'women' || product.gender === 'men') return product.gender;

  const extraWomen = hasGenderCue(extra, WOMEN_CONTEXT);
  const extraMen = hasGenderCue(extra, MEN_CONTEXT);
  if (extraWomen && !extraMen) return 'women';
  if (extraMen && !extraWomen) return 'men';
  return 'unisex';
}

export function matchesGenderPreference(
  product: CatalogProduct,
  gender: GenderPreference,
): boolean {
  if (gender === 'any') return true;
  const inferred = inferProductGender(product);
  return inferred === gender || inferred === 'unisex';
}

function toProduct(row: Record<string, unknown>): CatalogProduct {
  const product = row as unknown as CatalogProduct;
  return {
    ...product,
    price: Number(row.price),
    colors: Array.isArray(row.colors) ? (row.colors as string[]) : [],
    style_tags: Array.isArray(row.style_tags) ? (row.style_tags as string[]) : [],
    occasion_tags: Array.isArray(row.occasion_tags) ? (row.occasion_tags as string[]) : [],
  };
}

async function scopeBrands(
  supabase: SupabaseClient,
  scope: CatalogScope,
): Promise<{ supportedIds: string[]; unavailable: string[] } | null> {
  const selecting = scope.brandNames.length > 0;
  const requested = scope.requestedBrands
    .map((brand) => ({ name: brand.name, domain: normalizeDomain(brand.website) }))
    .filter((brand): brand is { name: string; domain: string } => brand.domain !== null);

  // No Preference means every approved brand plus the user's own added brands, never
  // stores other people added.
  const approved = supabase.from('brands').select('id, name, domain, status').eq('is_approved', true);
  const [byName, byDomain] = await Promise.all([
    selecting ? approved.in('name', scope.brandNames) : approved.eq('status', 'supported'),
    requested.length
      ? supabase
          .from('brands')
          .select('id, name, domain, status')
          .in('domain', requested.map((brand) => brand.domain))
      : Promise.resolve({ data: [] as BrandLookup[], error: null }),
  ]);
  if (byName.error || byDomain.error) return null;

  const rows = new Map<string, BrandLookup>();
  for (const row of [...(byName.data ?? []), ...(byDomain.data ?? [])] as BrandLookup[]) {
    rows.set(row.id, row);
  }
  const supportedIds = [...rows.values()]
    .filter((row) => row.status === 'supported')
    .map((row) => row.id);

  const supportedNames = new Set(
    [...rows.values()].filter((row) => row.status === 'supported').map((row) => row.name),
  );
  const supportedDomains = new Set(
    [...rows.values()].filter((row) => row.status === 'supported').map((row) => row.domain),
  );
  const unavailable = [
    ...(selecting ? scope.brandNames.filter((name) => !supportedNames.has(name)) : []),
    ...requested.filter((brand) => !supportedDomains.has(brand.domain)).map((brand) => brand.name),
  ];
  return { supportedIds, unavailable };
}

async function liveProducts(
  supabase: SupabaseClient,
  brandIds: string[],
  gender: GenderPreference,
  maxPrice: number,
): Promise<CatalogProduct[] | null> {
  const orFilter = genderFilter(gender);
  const results = await Promise.all(
    CATEGORIES.map((category) => {
      let query = supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .in('brand_id', brandIds)
        .neq('source', 'demo')
        .eq('category', category)
        .eq('availability', 'in_stock')
        .eq('currency', BUDGET_CURRENCY)
        .gte('last_checked', freshSince())
        .lte('price', maxPrice)
        .order('last_checked', { ascending: false })
        .limit(ROWS_PER_CATEGORY);
      if (orFilter) query = query.or(orFilter);
      return query;
    }),
  );
  if (results.some((result) => result.error)) return null;
  return results.flatMap((result) => (result.data ?? []) as unknown as Record<string, unknown>[])
    .map(toProduct);
}

async function demoProducts(
  supabase: SupabaseClient,
  scope: CatalogScope,
  maxPrice: number,
): Promise<CatalogProduct[] | null> {
  let query = supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('source', 'demo')
    .lte('price', maxPrice)
    .limit(ROWS_PER_CATEGORY);
  if (scope.brandNames.length) query = query.in('brand', scope.brandNames);
  const { data, error } = await query;
  if (error) return null;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toProduct);
}

/**
 * Real, in-stock, recently checked products from the user's brand scope. Selected brands are
 * never widened to other brands; demo rows are used only when explicitly allowed and nothing
 * real matches, and are never mixed with real products.
 */
export async function loadCatalog(
  supabase: SupabaseClient,
  params: {
    scope: CatalogScope;
    gender: GenderPreference;
    maxPrice: number;
    allowDemo: boolean;
  },
): Promise<CatalogResult> {
  const brands = await scopeBrands(supabase, params.scope);
  if (!brands) return { ok: false, code: 'network', unavailableBrands: [] };

  if (brands.supportedIds.length) {
    const products = await liveProducts(
      supabase,
      brands.supportedIds,
      params.gender,
      params.maxPrice,
    );
    if (!products) return { ok: false, code: 'network', unavailableBrands: [] };
    const gendered = products.filter((product) =>
      matchesGenderPreference(product, params.gender),
    );
    if (gendered.length || !params.allowDemo) {
      return {
        ok: true,
        products: gendered,
        catalogSource: 'live',
        unavailableBrands: brands.unavailable,
      };
    }
  }

  if (params.allowDemo) {
    const products = await demoProducts(supabase, params.scope, params.maxPrice);
    if (!products) return { ok: false, code: 'network', unavailableBrands: [] };
    const gendered = products.filter((product) =>
      matchesGenderPreference(product, params.gender),
    );
    if (gendered.length) {
      return { ok: true, products: gendered, catalogSource: 'demo', unavailableBrands: [] };
    }
  }

  return {
    ok: false,
    code: params.scope.brandNames.length ? 'brands_unavailable' : 'catalog_empty',
    unavailableBrands: brands.unavailable,
  };
}

const STYLE_KEYWORDS: Record<string, string[]> = {
  streetwear: ['hoodie', 'graphic', 'oversized', 'cargo', 'sneaker', 'jogger', 'sweatshirt', 'baggy', 'logo', 'puffer', 'boxy'],
  y2k: ['baby tee', 'crop', 'low rise', 'flare', 'mini', 'rhinestone', 'velour', 'platform', 'metallic', 'baggy', 'butterfly'],
  'old money': ['polo', 'oxford', 'cable', 'cashmere', 'loafer', 'chino', 'blazer', 'linen', 'knit', 'pleated', 'wool', 'quarter zip'],
  minimalist: ['essential', 'basic', 'crew', 'straight', 'solid', 'relaxed', 'plain', 'white', 'black', 'neutral', 'clean'],
  preppy: ['polo', 'oxford', 'chino', 'cardigan', 'pleated', 'loafer', 'blazer', 'button', 'stripe', 'varsity', 'cable'],
  athleisure: ['jogger', 'legging', 'track', 'tech', 'performance', 'running', 'training', 'zip', 'fleece', 'sneaker', 'active', 'sweat'],
  casual: ['tee', 'jean', 'denim', 'crew', 'hoodie', 'sneaker', 'relaxed', 'short', 'flannel', 'sweatshirt'],
  formal: ['suit', 'blazer', 'dress shirt', 'trouser', 'oxford', 'loafer', 'derby', 'tie', 'wool', 'tailored', 'pleated'],
  'clean girl': ['ribbed', 'tank', 'slip', 'satin', 'bodysuit', 'straight', 'neutral', 'cream', 'white', 'gold', 'knit'],
  grunge: ['flannel', 'plaid', 'distressed', 'ripped', 'black', 'boot', 'band', 'washed', 'oversized', 'leather', 'combat'],
  runway: ['statement', 'leather', 'satin', 'sheer', 'sculpt', 'tailored', 'metallic', 'platform', 'structured', 'oversized'],
  'quiet luxury': ['cashmere', 'merino', 'wool', 'silk', 'linen', 'suede', 'camel', 'knit', 'tailored', 'loafer', 'trouser'],
  'dark academia': ['tweed', 'wool', 'cardigan', 'turtleneck', 'trouser', 'oxford', 'loafer', 'brown', 'plaid', 'blazer', 'corduroy'],
  'elevated streetwear': ['premium', 'heavyweight', 'relaxed', 'suede', 'leather', 'cargo', 'overshirt', 'knit', 'sneaker', 'bomber', 'wide leg'],
};

const OCCASION_KEYWORDS: Record<string, string[]> = {
  everyday: ['tee', 'jean', 'sneaker', 'hoodie', 'relaxed', 'crew'],
  date: ['button', 'knit', 'fitted', 'satin', 'chelsea', 'polo', 'slim'],
  party: ['satin', 'metallic', 'sequin', 'statement', 'black', 'leather'],
  school: ['hoodie', 'jean', 'sneaker', 'backpack', 'crew', 'cardigan', 'sweatshirt'],
  work: ['button', 'chino', 'trouser', 'oxford', 'loafer', 'blazer', 'polo'],
  vacation: ['linen', 'short', 'sandal', 'camp', 'tank', 'lightweight', 'resort'],
  event: ['blazer', 'suit', 'tailored', 'loafer', 'oxford', 'dress'],
  'night out': ['black', 'leather', 'satin', 'boot', 'fitted', 'jacket'],
};

function keywordHits(text: string, keywords: string[]): number {
  return keywords.reduce(
    (hits, keyword) => (new RegExp(`\\b${keyword}s?\\b`).test(text) ? hits + 1 : hits),
    0,
  );
}

/** Relevance of a product to the vibe/occasion from its tags (demo) or its text (real). */
export function relevanceScore(
  product: CatalogProduct,
  styleTags: string[],
  occasion: string,
): number {
  const text = [
    product.name,
    product.subcategory,
    product.material,
    product.colors.join(' '),
    product.description?.slice(0, 300),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const tags = product.style_tags.map((tag) => tag.toLowerCase());
  const occasionTag = occasion.toLowerCase();

  let score = 0;
  if (tags.some((tag) => styleTags.includes(tag))) score += 5;
  if (product.occasion_tags.some((tag) => tag.toLowerCase() === occasionTag)) score += 2;
  for (const [index, style] of styleTags.entries()) {
    const hits = keywordHits(text, STYLE_KEYWORDS[style] ?? []);
    score += index === 0 ? hits * 2 : hits;
  }
  score += keywordHits(text, OCCASION_KEYWORDS[occasionTag] ?? []);
  return score;
}
