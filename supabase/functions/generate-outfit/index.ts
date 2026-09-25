import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { corsHeaders, friendlyError, jsonResponse } from '../_shared/cors.ts';
import { currentSeason } from '../_shared/catalog/fashionAttributes.ts';
import { scoreOutfit } from '../_shared/catalog/outfitScoring.ts';
import { styleAliasTags } from '../_shared/catalog/fashionSignals.ts';
import { applyOutfitRevision } from '../_shared/fashionAI/applyOutfitRevision.ts';
import {
  criticProductsFromCatalog,
  revisionCatalogFromProducts,
} from '../_shared/fashionAI/criticInput.ts';
import { createFashionAIProvider } from '../_shared/fashionAI/createProvider.ts';
import {
  critiqueWinningOutfit,
  toFashionCriticFields,
} from '../_shared/fashionAI/critiqueWinningOutfit.ts';
import { logOutfitScore, toFashionResponseFields } from './attachFashionScore.ts';
import {
  type AiItem,
  type AiOutfit,
  evaluateOutfitCandidates,
  logOutfitCandidates,
  parseGeminiOutfitCandidates,
} from './outfitCandidates.ts';
import {
  type CatalogProduct,
  type GenderPreference,
  inferProductGender,
  loadCatalog,
  type ProductCategory,
  isClassyLook,
  isDressFootwear,
  parseSkinTone,
  relevanceScore,
  skinToneColorScore,
  type SkinTonePreference,
} from './catalog.ts';

type Product = CatalogProduct;

type Measurements = {
  unit?: string;
  height_cm?: number | null;
  weight_kg?: number | null;
  shoulders_cm?: number | null;
  chest_cm?: number | null;
  waist_cm?: number | null;
  hips_cm?: number | null;
  thigh_cm?: number | null;
  inseam_cm?: number | null;
};

type InspirationInput =
  | { type: 'image'; file_name?: string | null; mime_type?: string | null }
  | { type: 'link' | 'pinterest' | 'instagram'; url: string };

type BrandPreference = {
  mode?: 'selected' | 'no_preference';
  brands?: string[];
  requested_brands?: Array<{ name: string; website: string }>;
};

type GenerateRequest = {
  style: string;
  occasion: string;
  budget: number;
  /** When set, shoes are budgeted separately and `budget` covers everything else. */
  shoe_budget?: number | null;
  exclude_product_ids?: string[];
  measurements?: Measurements | null;
  inspiration?: InspirationInput[];
  brand_preference?: BrandPreference;
  gender?: GenderPreference;
  skin_tone?: SkinTonePreference | null;
  age?: number | null;
};

type StylingContext = {
  measurements: Record<string, number | string> | null;
  inspiration: InspirationInput[];
  preferredBrands: string[];
  requestedBrands: Array<{ name: string; website: string }>;
};

function readMeasurements(input: unknown): StylingContext['measurements'] {
  if (!input || typeof input !== 'object') return null;
  const out: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === 'unit' && typeof value === 'string') out.unit = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function readInspiration(input: unknown): InspirationInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is InspirationInput => {
      if (!item || typeof item !== 'object') return false;
      const type = (item as { type?: unknown }).type;
      if (type === 'image') return true;
      return (
        (type === 'link' || type === 'pinterest' || type === 'instagram') &&
        typeof (item as { url?: unknown }).url === 'string'
      );
    })
    .slice(0, 6);
}

function readStylingContext(body: GenerateRequest): StylingContext {
  const pref = body.brand_preference ?? {};
  const preferredBrands =
    pref.mode === 'selected' && Array.isArray(pref.brands)
      ? pref.brands.filter((brand) => typeof brand === 'string').slice(0, 40)
      : [];
  const requestedBrands = Array.isArray(pref.requested_brands)
    ? pref.requested_brands
        .filter(
          (brand) =>
            brand &&
            typeof brand.name === 'string' &&
            typeof brand.website === 'string',
        )
        .slice(0, 10)
    : [];
  const measurements = {
    ...(readMeasurements(body.measurements) ?? {}),
    ...(typeof body.age === 'number' && Number.isFinite(body.age)
      ? { age: Math.round(body.age) }
      : {}),
  };
  return {
    measurements: Object.keys(measurements).length ? measurements : null,
    inspiration: readInspiration(body.inspiration),
    preferredBrands,
    requestedBrands,
  };
}

const REQUIRED_CATEGORIES: ProductCategory[] = ['top', 'bottom', 'shoes'];
const OPTIONAL_CATEGORIES: ProductCategory[] = ['outerwear', 'accessory'];
const MAX_ATTEMPTS = 3;
/** Per category: best matches (spread across brands) plus the cheapest remaining, for budget room. */
const TOP_PICKS_PER_CATEGORY = 7;
const CHEAP_PICKS_PER_CATEGORY = 3;

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

type BudgetPlan = {
  outfit: number;
  /** null means shoes share the outfit budget. */
  shoes: number | null;
};

function isSeparateShoe(plan: BudgetPlan, product: Product): boolean {
  return plan.shoes !== null && product.category === 'shoes';
}

function priceCap(plan: BudgetPlan, product: Product): number {
  return isSeparateShoe(plan, product) ? plan.shoes! : plan.outfit;
}

/** Spend counted against the outfit budget (excludes separately budgeted shoes). */
function outfitSpend(plan: BudgetPlan, products: Product[]): number {
  return products
    .filter((product) => !isSeparateShoe(plan, product))
    .reduce((sum, product) => sum + asNumber(product.price), 0);
}

function fitsBudget(plan: BudgetPlan, products: Product[]): boolean {
  const shoeSpend = products
    .filter((product) => isSeparateShoe(plan, product))
    .reduce((sum, product) => sum + asNumber(product.price), 0);
  return (
    outfitSpend(plan, products) <= plan.outfit &&
    (plan.shoes === null || shoeSpend <= plan.shoes)
  );
}

function groupByCategory(products: Product[]): Record<ProductCategory, Product[]> {
  const groups: Record<ProductCategory, Product[]> = {
    top: [],
    bottom: [],
    shoes: [],
    outerwear: [],
    accessory: [],
  };
  for (const product of products) {
    if (groups[product.category]) {
      groups[product.category].push(product);
    }
  }
  return groups;
}

/** Takes up to `count` items in rank order, rotating through brands so one store can't fill the list. */
function spreadAcrossBrands(ranked: Product[], count: number): Product[] {
  const byBrand = new Map<string, Product[]>();
  for (const product of ranked) {
    const key = product.brand_id ?? product.brand;
    byBrand.set(key, [...(byBrand.get(key) ?? []), product]);
  }
  const queues = [...byBrand.values()];
  const picked: Product[] = [];
  while (picked.length < count && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < count) picked.push(next);
    }
  }
  return picked;
}

function filterCandidates(
  products: Product[],
  style: string,
  occasion: string,
  budget: BudgetPlan,
  excludeIds: Set<string>,
  skinTone: SkinTonePreference | null,
): Product[] {
  const styleTags = styleAliasTags(style);

  const classy = isClassyLook(style, occasion);
  const affordable = products.filter(
    (product) =>
      !excludeIds.has(product.id) &&
      asNumber(product.price) <= priceCap(budget, product) &&
      (!isDressFootwear(product) || classy),
  );
  const scores = new Map(
    affordable.map((product) => [
      product.id,
      relevanceScore(product, styleTags, occasion) + skinToneColorScore(product, skinTone),
    ]),
  );
  const MIN_STYLE_SCORE = 2;
  const tagged = affordable.filter((product) =>
    product.style_tags.some((tag) => styleTags.includes(normalizeTag(tag))),
  );
  // Live rows rarely have style_tags; keep items that read like the vibe when a
  // category has matches, so Streetwear and Old Money are not the same pool.
  const pool = affordable.filter((product) => {
    if (product.source === 'demo') {
      return product.style_tags.some((tag) => styleTags.includes(normalizeTag(tag)));
    }
    return true;
  });
  const grouped = groupByCategory(pool.length ? pool : affordable);
  const trimmed: Product[] = [];

  for (const category of [...REQUIRED_CATEGORIES, ...OPTIONAL_CATEGORIES]) {
    const ranked = [...grouped[category]].sort(
      (a, b) =>
        (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) ||
        asNumber(a.price) - asNumber(b.price),
    );
    const stylish = ranked.filter(
      (product) =>
        (scores.get(product.id) ?? 0) >= MIN_STYLE_SCORE ||
        tagged.some((row) => row.id === product.id),
    );
    const focused = stylish.length ? stylish : ranked;
    const best = spreadAcrossBrands(focused, TOP_PICKS_PER_CATEGORY);
    const chosen = new Set(best.map((product) => product.id));
    const cheapest = ranked
      .filter((product) => !chosen.has(product.id))
      .sort((a, b) => asNumber(a.price) - asNumber(b.price))
      .slice(0, CHEAP_PICKS_PER_CATEGORY);
    trimmed.push(...best, ...cheapest);
  }

  return trimmed;
}

function candidatesForPrompt(products: Product[]) {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    gender: inferProductGender(product),
    ...(product.subcategory ? { subcategory: product.subcategory } : {}),
    price: asNumber(product.price),
    colors: product.colors.length ? product.colors.slice(0, 4) : [product.color],
    ...(product.material ? { material: product.material.slice(0, 80) } : {}),
    ...(product.fit ? { fit: product.fit } : {}),
    ...(product.silhouette ? { silhouette: product.silhouette } : {}),
    ...(product.pattern ? { pattern: product.pattern } : {}),
    ...(product.formality ? { formality: product.formality } : {}),
    ...(product.description ? { description: product.description.slice(0, 160) } : {}),
    ...(product.style_tags.length ? { style_tags: product.style_tags } : {}),
    ...(product.aesthetic_tags.length ? { aesthetic_tags: product.aesthetic_tags } : {}),
    ...(product.occasion_tags.length ? { occasion_tags: product.occasion_tags } : {}),
    ...(product.season_tags.length ? { season_tags: product.season_tags } : {}),
  }));
}

function vibeSeed(style: string, occasion: string): number {
  let hash = 0;
  const key = `${style.toLowerCase()}|${occasion.toLowerCase()}`;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash';

function geminiModels(): string[] {
  const primary = Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  const fallback = Deno.env.get('GEMINI_FALLBACK_MODEL') || FALLBACK_GEMINI_MODEL;
  return [...new Set([primary, fallback])];
}

async function callGemini(params: {
  style: string;
  occasion: string;
  budget: BudgetPlan;
  candidates: ReturnType<typeof candidatesForPrompt>;
  excludeIds: string[];
  attempt: number;
  stricter: boolean;
  context: StylingContext;
  gender: GenderPreference;
  skinTone: SkinTonePreference | null;
}): Promise<AiOutfit[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('ai_missing');
  }

  const shopFor =
    params.gender === 'men'
      ? 'men'
      : params.gender === 'women'
        ? 'women'
        : 'any gender';

  const system = `You are Styli, an expert fashion stylist.
The candidates are real products retrieved from the user's chosen stores.
Your job is only to choose and rank among them: propose up to 5 complete outfits ONLY from the provided candidate products.
Return product_id values from that list only.
Never invent products, IDs, names, prices, images, brands, or links.
Return ONLY valid JSON with this shape:
{
  "outfit_name": string,
  "styling_tip": string,
  "candidates": [
    {
      "top_id": string,
      "bottom_id": string,
      "shoes_id": string,
      "outerwear_id": string | null,
      "accessory_id": string | null,
      "reason": string
    }
  ]
}
Rules:
- Return up to 5 candidates. Fewer is fine if the catalog cannot support more valid looks.
- Each candidate must include exactly one top, one bottom, and one shoes item.
- Optionally include one outerwear and/or one accessory ONLY if that candidate still stays within budget.
- Every id must come from the candidate list. Do not reuse the same product twice in one candidate.
- Shop for ${shopFor}. Never pick women's-coded pieces (skirts, dresses, heels, baby tees, crop tops, Mary Janes, blouses) when shopping for men. Never pick men's-only pieces when shopping for women.
- Strongly match the requested vibe. A Streetwear fit must not look like Old Money or Y2K.
- Prefer cohesive color/style for the requested vibe and occasion.
- Explore meaningful variation when the catalog allows: different colors, silhouettes, layering, or footwear. Do not invent variety the catalog cannot support, and never break the user's style, occasion, budget, gender, or brand constraints for diversity.
- If exclude_product_ids is non-empty, build different fits — do not reuse those products.
- If shoe_budget is null, keep the total of all selected candidate prices <= budget.
- If shoe_budget is a number, shoes are budgeted separately: the shoes item must cost <= shoe_budget, and all other selected items together must cost <= budget.
- Do not include duplicate categories.
- If body measurements are provided, favor cuts and silhouettes that flatter them.
- If skin_tone is set, prefer candidate colors that flatter that complexion. Do not invent colors or products.
- Dress shoes (loafers, oxfords, Marc Nolan) are only in the list for date, work, event, night out, or classy vibes. Do not force them into street or school fits.
- If inspiration links are provided, use them only as style direction; you cannot open them.
- Candidates are already limited to the user's brands and fit preference; judge them on style, color and occasion.`;

  const user = {
    style: params.style,
    occasion: params.occasion,
    shop_for: shopFor,
    skin_tone: params.skinTone,
    budget: params.budget.outfit,
    shoe_budget: params.budget.shoes,
    exclude_product_ids: params.excludeIds,
    attempt: params.attempt,
    stricter: params.stricter,
    instruction: params.stricter
      ? 'Previous attempt exceeded budget or was invalid. Propose up to 5 cheaper compatible outfits and omit optional items if needed.'
      : params.excludeIds.length
        ? 'Propose up to 5 different outfits than the excluded products, still matching the vibe.'
        : 'Propose up to 5 complete outfits within budget for this vibe. Vary them when the catalog allows.',
    measurements: params.context.measurements,
    inspiration: params.context.inspiration,
    candidates: params.candidates,
  };

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(user) }] }],
    generationConfig: {
      temperature: params.stricter ? 0.2 : params.excludeIds.length ? 0.95 : 0.75,
      responseMimeType: 'application/json',
    },
  });

  let response: Response | null = null;
  for (const model of geminiModels()) {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body,
      },
    );
    // Overloaded, rate-limited, or retired models fall through to the next one.
    if (![404, 429, 500, 503].includes(response.status)) break;
    await response.body?.cancel();
  }

  if (!response?.ok) {
    throw new Error('ai');
  }

  const payload = await response.json();
  const parts: Array<{ text?: unknown; thought?: unknown }> =
    payload?.candidates?.[0]?.content?.parts ?? [];
  const content = parts
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');
  if (!content.trim()) {
    throw new Error('invalid_ai');
  }

  return parseGeminiOutfitCandidates(content);
}

/**
 * Deterministic local stylist used only when GEMINI_API_KEY is unset and
 * ALLOW_HEURISTIC_FALLBACK=true (local Stage 3 testing). Production must set GEMINI_API_KEY.
 */
function heuristicOutfit(
  style: string,
  occasion: string,
  budget: BudgetPlan,
  candidates: Product[],
  excludeIds: Set<string>,
  attempt: number,
  skinTone: SkinTonePreference | null,
): AiOutfit {
  const styleTags = styleAliasTags(style);
  const scoreOf = (product: Product) =>
    relevanceScore(product, styleTags, occasion) + skinToneColorScore(product, skinTone);
  const grouped = groupByCategory(candidates);

  const rank = (list: Product[]) =>
    [...list].sort(
      (a, b) => scoreOf(b) - scoreOf(a) || asNumber(a.price) - asNumber(b.price),
    );

  const tops = rank(grouped.top).slice(0, 10);
  const bottoms = rank(grouped.bottom).slice(0, 10);
  const shoes = rank(grouped.shoes).slice(0, 10);

  type Combo = {
    top: Product;
    bottom: Product;
    shoes: Product;
    total: number;
    styleScore: number;
    overlap: number;
  };
  const combos: Combo[] = [];
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        if (fitsBudget(budget, [top, bottom, shoe])) {
          const ids = [top.id, bottom.id, shoe.id];
          combos.push({
            top,
            bottom,
            shoes: shoe,
            total: asNumber(top.price) + asNumber(bottom.price) + asNumber(shoe.price),
            styleScore: scoreOf(top) + scoreOf(bottom) + scoreOf(shoe),
            overlap: ids.filter((id) => excludeIds.has(id)).length,
          });
        }
      }
    }
  }

  if (!combos.length) {
    throw new Error('no_products');
  }

  combos.sort((a, b) => {
    if (a.overlap !== b.overlap) return a.overlap - b.overlap;
    if (b.styleScore !== a.styleScore) return b.styleScore - a.styleScore;
    return a.total - b.total;
  });

  const fresh = combos.filter((combo) => {
    const ids = [combo.top.id, combo.bottom.id, combo.shoes.id];
    return !(excludeIds.size && ids.every((id) => excludeIds.has(id)));
  });
  const ranked = fresh.length ? fresh : combos;
  const minOverlap = ranked[0].overlap;
  const bestScore = ranked[0].styleScore;
  const band = ranked.filter(
    (combo) => combo.overlap === minOverlap && combo.styleScore >= bestScore - 1,
  );
  const chosen = band[(vibeSeed(style, occasion) + attempt) % band.length];

  const items: AiItem[] = [
    {
      product_id: chosen.top.id,
      reason: `Anchors the ${style} vibe for ${occasion}.`,
    },
    {
      product_id: chosen.bottom.id,
      reason: `Balances the fit for a ${occasion.toLowerCase()} look.`,
    },
    {
      product_id: chosen.shoes.id,
      reason: `Grounds the outfit without breaking the budget.`,
    },
  ];

  let remaining =
    budget.outfit - outfitSpend(budget, [chosen.top, chosen.bottom, chosen.shoes]);
  for (const category of OPTIONAL_CATEGORIES) {
    const optional = rank(grouped[category]).find(
      (product) =>
        !excludeIds.has(product.id) && asNumber(product.price) <= remaining,
    );
    if (optional) {
      remaining -= asNumber(optional.price);
      items.push({
        product_id: optional.id,
        reason: `Optional ${category} that stays within budget.`,
      });
    }
  }

  return {
    outfit_name: `${style} ${occasion} Edit`,
    items,
    styling_tip: `Keep the silhouette clean and let your ${style.toLowerCase()} pieces do the talking.`,
  };
}

function canBuildCoreOutfit(candidates: Product[], budget: BudgetPlan): boolean {
  const grouped = groupByCategory(candidates);
  for (const top of grouped.top) {
    for (const bottom of grouped.bottom) {
      for (const shoe of grouped.shoes) {
        if (fitsBudget(budget, [top, bottom, shoe])) return true;
      }
    }
  }
  return false;
}

function validateAndBuild(
  ai: AiOutfit,
  candidateMap: Map<string, Product>,
  budget: BudgetPlan,
) {
  const selected: Array<{ product: Product; reason: string }> = [];
  const seenCategories = new Set<ProductCategory>();

  for (const item of ai.items) {
    const product = candidateMap.get(item.product_id);
    if (!product) {
      throw new Error('invalid_ai');
    }
    if (seenCategories.has(product.category)) {
      throw new Error('invalid_ai');
    }
    seenCategories.add(product.category);
    selected.push({ product, reason: item.reason || 'Selected for this fit.' });
  }

  for (const required of REQUIRED_CATEGORIES) {
    if (!seenCategories.has(required)) {
      throw new Error('invalid_ai');
    }
  }

  for (const category of seenCategories) {
    if (
      !REQUIRED_CATEGORIES.includes(category) &&
      !OPTIONAL_CATEGORIES.includes(category)
    ) {
      throw new Error('invalid_ai');
    }
  }

  const total = selected.reduce(
    (sum, entry) => sum + asNumber(entry.product.price),
    0,
  );
  const totalPrice = Math.round(total * 100) / 100;

  if (!fitsBudget(budget, selected.map((entry) => entry.product))) {
    throw new Error('budget');
  }

  return { selected, totalPrice };
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return friendlyError('unknown', 405);
  }

  try {
    const body = (await req.json()) as GenerateRequest;
    const style = typeof body.style === 'string' ? body.style.trim() : '';
    const occasion = typeof body.occasion === 'string' ? body.occasion.trim() : '';
    const outfitBudget = asNumber(body.budget);
    const shoeBudget =
      body.shoe_budget === null || body.shoe_budget === undefined
        ? null
        : asNumber(body.shoe_budget);
    const excludeIds = new Set(
      (body.exclude_product_ids ?? []).filter((id) => typeof id === 'string'),
    );

    if (
      !style ||
      !occasion ||
      !Number.isFinite(outfitBudget) ||
      outfitBudget <= 0 ||
      (shoeBudget !== null && (!Number.isFinite(shoeBudget) || shoeBudget <= 0))
    ) {
      return friendlyError('invalid_ai', 400);
    }
    const budget: BudgetPlan = { outfit: outfitBudget, shoes: shoeBudget };

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('EXPO_PUBLIC_SUPABASE_URL');
    const serviceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      return friendlyError('network', 500);
    }

    // Local PostgREST proxy expects /rest/v1 — createClient already adds that.
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const context = readStylingContext(body);
    const gender: GenderPreference =
      body.gender === 'men' || body.gender === 'women' ? body.gender : 'any';
    const skinTone = parseSkinTone(body.skin_tone);
    const selectingBrands = context.preferredBrands.length > 0;
    const localFn = Number.isFinite(Number(Deno.env.get('EDGE_FUNCTION_PORT') ?? ''));

    const catalog = await loadCatalog(supabase, {
      scope: { brandNames: context.preferredBrands, requestedBrands: context.requestedBrands },
      gender,
      maxPrice: Math.max(budget.outfit, budget.shoes ?? 0),
      allowDemo: Deno.env.get('ALLOW_DEMO_CATALOG') === 'true' || localFn,
    });
    if (!catalog.ok) {
      if (catalog.code === 'network') return friendlyError('network', 500);
      return friendlyError(catalog.code, 404, { unavailable_brands: catalog.unavailableBrands });
    }
    const products = catalog.products;
    const brandsNoFit = (candidatePool: Product[]) => {
      const regrouped = groupByCategory(candidatePool);
      return friendlyError(selectingBrands ? 'brands_no_fit' : 'no_products', 404, {
        missing_categories: REQUIRED_CATEGORIES.filter((c) => regrouped[c].length === 0),
        unavailable_brands: catalog.unavailableBrands,
      });
    };

    const candidates = filterCandidates(
      products,
      style,
      occasion,
      budget,
      excludeIds,
      skinTone,
    );

    let workingCandidates = candidates;
    const grouped = groupByCategory(workingCandidates);
    const missingRequired = REQUIRED_CATEGORIES.some(
      (required) => grouped[required].length === 0,
    );

    if (missingRequired || !canBuildCoreOutfit(workingCandidates, budget)) {
      if (excludeIds.size > 0) {
        // Soft rebuild: prefer new pieces, but allow overlap if hard exclude can't fill a fit.
        workingCandidates = filterCandidates(
          products,
          style,
          occasion,
          budget,
          new Set(),
          skinTone,
        );
      }
      const regrouped = groupByCategory(workingCandidates);
      if (
        REQUIRED_CATEGORIES.some((required) => regrouped[required].length === 0) ||
        !canBuildCoreOutfit(workingCandidates, budget)
      ) {
        return brandsNoFit(workingCandidates);
      }
    }

    const promptCandidates = candidatesForPrompt(workingCandidates);
    const allowHeuristic =
      Deno.env.get('ALLOW_HEURISTIC_FALLBACK') === 'true' || localFn;
    const hasGemini = Boolean(Deno.env.get('GEMINI_API_KEY'));
    const excludedList = [...excludeIds];

    let lastError: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const stricter = attempt > 1;
        const geminiArgs = {
          style,
          occasion,
          budget,
          candidates: promptCandidates,
          excludeIds: excludedList,
          attempt,
          stricter,
          context,
          gender,
          skinTone,
        };
        const heuristicArgs = [
          style,
          occasion,
          budget,
          workingCandidates,
          excludeIds,
          attempt - 1,
          skinTone,
        ] as const;
        const productMap = new Map(
          workingCandidates.map((product) => [product.id, product]),
        );
        const evaluate = (outfits: AiOutfit[]) =>
          evaluateOutfitCandidates({
            outfits,
            excludeIds,
            validate: (outfit) => validateAndBuild(outfit, productMap, budget),
            productsOf: (built) => built.selected.map(({ product }) => product),
            score: (products) =>
              scoreOutfit(products, {
                style,
                occasion,
                skinTone,
                measurements: context.measurements,
              }),
          });

        let geminiOutfits: AiOutfit[] | null = null;
        if (hasGemini) {
          try {
            geminiOutfits = await callGemini(geminiArgs);
          } catch (err) {
            if (!allowHeuristic) throw err;
          }
        } else if (!allowHeuristic) {
          throw new Error('ai_missing');
        }

        let evaluated = geminiOutfits ? evaluate(geminiOutfits) : null;
        if (evaluated) {
          const valid = evaluated.candidates.filter((candidate) => candidate.valid);
          logOutfitCandidates({
            count: evaluated.count,
            valid_count: valid.length,
            scores: valid.map((candidate) => candidate.score),
            selected_score: evaluated.winner?.score ?? null,
            invalid: evaluated.candidates
              .filter((candidate) => !candidate.valid)
              .map((candidate) => candidate.reason),
          });
        }

        if (!evaluated?.winner && allowHeuristic) {
          evaluated = evaluate([heuristicOutfit(...heuristicArgs)]);
        }

        const winner = evaluated?.winner;
        if (!winner) {
          throw new Error('invalid_ai');
        }

        const { selected, totalPrice } = winner.built;
        const fashion = winner.fashion;
        logOutfitScore({
          score: fashion.score,
          style,
          occasion,
          breakdown: fashion.breakdown,
          issues: fashion.issues,
        });

        const fashionAI = createFashionAIProvider();
        const season = currentSeason();
        const scoringContext = {
          style,
          occasion,
          skinTone,
          measurements: context.measurements,
        };
        const criticInput = {
          style,
          occasion,
          skinTone,
          measurements: context.measurements,
          season,
          products: criticProductsFromCatalog(selected.map(({ product }) => product)),
        };
        const critic = await critiqueWinningOutfit(criticInput, fashionAI);

        const placeholderCritic = {
          overall_assessment: 'acceptable' as const,
          style_match: 8,
          color_harmony: 8,
          proportion: 8,
          occasion_match: 8,
          cohesion: 8,
          strengths: [] as string[],
          issues: [] as Array<{ type: string; severity: 'minor' | 'moderate' | 'major' }>,
          recommendations: [] as string[],
        };

        let finalName = winner.outfit.outfit_name;
        let finalTip = winner.outfit.styling_tip;
        let finalSelected = selected;
        let finalTotal = totalPrice;
        let finalFashion = fashion;
        let finalCritic = critic;
        let revisionFields = {
          fashion_revision_attempted: false,
          fashion_revision_accepted: false,
          fashion_revision_reason: critic.fashion_critic
            ? 'critic_did_not_identify_meaningful_issue'
            : 'critic_unavailable',
        };

        try {
          const revised = await applyOutfitRevision({
            critic: critic.fashion_critic,
            originalCriticRun: critic,
            original: {
              outfitName: winner.outfit.outfit_name,
              stylingTip: winner.outfit.styling_tip,
              items: selected.map(({ product, reason }) => ({
                product_id: product.id,
                reason,
              })),
              built: winner.built,
              products: selected.map(({ product }) => product),
              fashion,
            },
            revisionInput: {
              style,
              occasion,
              skinTone,
              measurements: context.measurements,
              season,
              currentOutfit: criticInput.products,
              critic: critic.fashion_critic ?? placeholderCritic,
              catalog: revisionCatalogFromProducts(workingCandidates),
            },
            provider: fashionAI,
            validate: (outfit) => validateAndBuild(outfit, productMap, budget),
            productsOf: (built) => built.selected.map(({ product }) => product),
            score: (products) => scoreOutfit(products, scoringContext),
            critique: (input) => critiqueWinningOutfit(input, fashionAI),
            criticInputFor: (products) => ({
              style,
              occasion,
              skinTone,
              measurements: context.measurements,
              season,
              products: criticProductsFromCatalog(products),
            }),
          });
          finalName = revised.outfitName;
          finalTip = revised.stylingTip;
          finalSelected = revised.built.selected;
          finalTotal = revised.built.totalPrice;
          finalFashion = revised.fashion;
          finalCritic = revised.critic;
          revisionFields = revised.revision;
        } catch {
          // Phase 3 must never fail generation.
        }

        if (revisionFields.fashion_revision_accepted) {
          logOutfitScore({
            score: finalFashion.score,
            style,
            occasion,
            breakdown: finalFashion.breakdown,
            issues: finalFashion.issues,
          });
        }

        return jsonResponse({
          outfit_name: finalName,
          styling_tip: finalTip,
          style,
          occasion,
          budget: budget.outfit,
          shoe_budget: budget.shoes,
          total_price: finalTotal,
          catalog_source: catalog.catalogSource,
          unavailable_brands: catalog.unavailableBrands,
          ...toFashionResponseFields(finalFashion),
          ...toFashionCriticFields(finalCritic),
          ...revisionFields,
          items: finalSelected.map(({ product, reason }) => ({
            product_id: product.id,
            reason,
            product: {
              id: product.id,
              name: product.name,
              brand: product.brand,
              category: product.category,
              subcategory: product.subcategory,
              price: asNumber(product.price),
              currency: product.currency,
              color: product.color,
              image_url: product.image_url,
              purchase_url: product.purchase_url,
              style_tags: product.style_tags,
              occasion_tags: product.occasion_tags,
              source: product.source,
            },
          })),
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'unknown';
        if (lastError === 'ai_missing') {
          return friendlyError('ai', 500);
        }
        // Keep retrying for no_products/budget/invalid_ai within MAX_ATTEMPTS
        continue;
      }
    }

    if (lastError === 'budget') return friendlyError('budget', 422);
    if (lastError === 'ai') return friendlyError('ai', 502);
    return friendlyError('invalid_ai', 422);
  } catch {
    return friendlyError('unknown', 500);
  }
}

const localPort = Number(Deno.env.get('EDGE_FUNCTION_PORT') ?? '');
if (Number.isFinite(localPort) && localPort > 0) {
  Deno.serve({ port: localPort, hostname: '127.0.0.1' }, handler);
} else {
  Deno.serve(handler);
}
