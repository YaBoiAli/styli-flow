import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { corsHeaders, friendlyError, jsonResponse } from '../_shared/cors.ts';
import { currentSeason } from '../_shared/catalog/fashionAttributes.ts';
import { scoreOutfit } from '../_shared/catalog/outfitScoring.ts';
import { enrichProductsWithVisualAttributes } from '../_shared/catalog/visualAnalysis.ts';
import { visualForPrompt } from '../_shared/catalog/visualAttributes.ts';
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
  tryParseGeminiOutfitCandidates,
} from './outfitCandidates.ts';
import {
  type CatalogProduct,
  type GenderPreference,
  inferProductGender,
  loadCatalog,
  type ProductCategory,
  parseSkinTone,
  relevanceScore,
  skinToneColorScore,
  type SkinTonePreference,
} from './catalog.ts';
import {
  asNumber,
  type BudgetPlan,
  OPTIONAL_CATEGORIES,
  fitsBudget,
  groupByCategory,
  outfitSpend,
  poolSnapshotRows,
  rankWorkingPoolDetailed,
  shortlistForGemini,
} from './candidateShortlist.ts';
import {
  createGenerationTraceId,
  fallbackReasonForGemini,
  generationModeForResponse,
  genLog,
  logCandidateScores,
  logFinalOutfit,
  logGeminiPool,
  logMetadataPreservation,
} from './genTrace.ts';
import {
  CANDIDATE_INTERPRETATION_GUIDE,
  IDENTITY_REUSE_PENALTY,
  REBUILD_OUTFIT_INSTRUCTION,
  SHORTLIST_QUALITY_BAND,
  uniqueProductIds,
  type PreviousOutfitItem,
  matchPreviousInCatalog,
  outfitDiversityScore,
  parsePreviousOutfit,
  productIdentityKey,
  reusePenalty,
} from './outfitDiversity.ts';
import {
  logPerf,
  logPerfTotal,
  logSkippedPerfStages,
  perfNow,
  resetPerfLog,
} from '../_shared/perfLog.ts';
import { Channel3Client, readChannel3ApiKey } from '../_shared/catalog/channel3/client.ts';
import { createChannel3SearchBackend } from '../_shared/catalog/searchStrategy/channel3Backend.ts';
import { emptyLiveRetrieval, resolveGenerationCatalog } from './liveCatalog.ts';
import { liveRetrievalFromError, retrieveLiveChannel3Catalog, type LiveRetrieval } from './liveRetrieval.ts';
import {
  GeminiGenerationError,
  generateGeminiContent,
  geminiJsonGenerationConfig,
  geminiModelsFromEnv,
  inspectGeminiPayload,
} from '../_shared/geminiResponse.ts';
import {
  assertNoForbiddenFootwear,
  assertValidOutfitCategories,
  liveRetrievalCategories,
  parseColorPreference,
  parseFootwearPreference,
  requiredOutfitCategories,
  sanitizeCriticForFootwear,
  type ColorPreference,
  type FootwearPreference,
  isFootwearProduct,
} from './footwearPreference.ts';

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
  /** Absent or any other value defaults to include (existing clients keep shoes). */
  footwear_preference?: 'include' | 'none';
  exclude_product_ids?: string[];
  previous_outfit_product_ids?: string[];
  previous_outfit?: Array<{
    product_id?: string;
    id?: string;
    name?: string;
    brand?: string;
    category?: string;
    color?: string;
  }>;
  measurements?: Measurements | null;
  inspiration?: InspirationInput[];
  brand_preference?: BrandPreference;
  gender?: GenderPreference;
  skin_tone?: SkinTonePreference | null;
  /** Absent or any other value defaults to style_first (existing color behavior). */
  color_preference?: 'complexion' | 'style_first';
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

const MAX_ATTEMPTS = 3;

function previousOutfitForPrompt(
  previousOutfit: PreviousOutfitItem[],
  catalog: Product[],
) {
  if (!previousOutfit.length) return [];
  const matched = matchPreviousInCatalog(catalog, previousOutfit);
  const byId = new Map(matched.map((product) => [product.id, product]));
  const byIdentity = new Map(matched.map((product) => [productIdentityKey(product), product]));
  return previousOutfit.map((item) => {
    const product = byId.get(item.product_id) ?? byIdentity.get(productIdentityKey(item));
    return {
      product_id: item.product_id,
      name: product?.name ?? item.name ?? null,
      brand: product?.brand ?? item.brand ?? null,
      category: product?.category ?? item.category ?? null,
      color: product?.color ?? item.color ?? null,
      ...(product?.visual_attributes ? { visual: visualForPrompt(product.visual_attributes) } : {}),
    };
  });
}

function candidatesForPrompt(products: Product[]) {
  return products.map((product) => {
    const visual = visualForPrompt(product.visual_attributes);
    return {
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
      ...(visual ? { visual } : {}),
    };
  });
}

function vibeSeed(style: string, occasion: string): number {
  let hash = 0;
  const key = `${style.toLowerCase()}|${occasion.toLowerCase()}`;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}


function stylistSystemPrompt(params: {
  shopFor: string;
  includeShoes: boolean;
  complexion: boolean;
  rebuild: boolean;
}): string {
  const slots = params.includeShoes
    ? `- Each candidate must include exactly one top, one bottom, and one shoes item.`
    : `- Each candidate must include exactly one top and one bottom.
- Footwear was intentionally excluded. Never include shoes, sneakers, boots, sandals, heels, loafers, or any footwear. Set shoes_id to null. A candidate with footwear is invalid.`;
  const shoesBudget = params.includeShoes
    ? `- If shoe_budget is null, keep the total of all selected candidate prices <= budget.
- If shoe_budget is a number, shoes are budgeted separately: the shoes item must cost <= shoe_budget, and all other selected items together must cost <= budget.
- Dress shoes (loafers, oxfords, Marc Nolan) are only in the list for date, work, event, night out, or classy vibes. Do not force them into street or school fits.`
    : `- Keep the total of all selected candidate prices <= budget.`;
  const complexion = params.complexion
    ? `- Color preference is complexion-first: use the user's complexion as one guide for clothing colors, especially on tops and outerwear. Bottoms and shoes matter less. Do not let complexion override style, occasion, gender, or budget. Do not invent colors.`
    : `- Color preference is style-first: let the requested style and occasion drive color. Do not force complexion matching.`;
  const shoesJson = params.includeShoes ? '"shoes_id": string,' : '"shoes_id": null,';

  return `You are Styli, a professional personal stylist selecting a complete look from real inventory.
You are not filling category slots. You are building outfits a person would actually want to wear and buy.

Objective: from the provided products only, compose the strongest complete outfits for this user.

The candidates are real products retrieved from the user's chosen stores.
Return product_id values from that list only.
Never invent products, IDs, names, prices, images, brands, links, or product attributes.
Return ONLY valid JSON with this shape:
{
  "outfit_name": string,
  "styling_tip": string,
  "candidates": [
    {
      "top_id": string,
      "bottom_id": string,
      ${shoesJson}
      "outerwear_id": string | null,
      "accessory_id": string | null,
      "reason": string
    }
  ]
}
Rules:
- Return up to 5 candidates. Return fewer if the catalog cannot support more looks you would actually recommend. Do not pad with weak combinations.
${slots}
- Optionally include one outerwear and/or one accessory ONLY if it improves the outfit and stays within budget. Skip extras that do not earn their place.
- Every id must come from the candidate list. Do not reuse the same product twice in one candidate.
- Shop for ${params.shopFor}. Never pick women's-coded pieces (skirts, dresses, heels, baby tees, crop tops, Mary Janes, blouses) when shopping for men. Never pick men's-only pieces when shopping for women.
- Do not select an item merely because it matches a keyword or style tag.
- Do not force a weak product into an outfit to fill a category if a stronger relationship exists among other pieces.
- Prefer products that create a clear relationship with the other selected pieces: silhouette, color, visual weight, and occasion.
- Each outfit needs a main piece and supporting pieces. Avoid random combinations of individually fine items.
- Prefer realistic wearability and purchase-worthiness over novelty.
- Use the requested style as an aesthetic direction, not a keyword filter. Streetwear has multiple valid compositions — do not default to oversized + dark unless that is the strongest available look.
- Respect budget, gender, occasion, and brand constraints.
${complexion}
- Explore meaningful variation when the catalog allows: different colors, silhouettes, or layering. Do not invent variety the catalog cannot support.
${CANDIDATE_INTERPRETATION_GUIDE}
${params.rebuild ? `- PREVIOUS OUTFIT is provided. ${REBUILD_OUTFIT_INSTRUCTION}` : ''}
${shoesBudget}
- Do not include duplicate categories.
- If body measurements are provided, favor cuts and silhouettes that flatter them.
- When a candidate includes a visual object, treat those attributes as observed. Do not invent colors, fits, patterns, or silhouettes that conflict with them.
- If inspiration links are provided, use them only as style direction; you cannot open them.
- Candidates are already limited to the user's brands and fit preference; judge them as a complete outfit, not as isolated products.`;
}

async function callGemini(params: {
  style: string;
  occasion: string;
  budget: BudgetPlan;
  candidates: ReturnType<typeof candidatesForPrompt>;
  excludeIds: string[];
  previousOutfit: ReturnType<typeof previousOutfitForPrompt>;
  attempt: number;
  stricter: boolean;
  context: StylingContext;
  gender: GenderPreference;
  skinTone: SkinTonePreference | null;
  footwearPreference: FootwearPreference;
  colorPreference: ColorPreference;
}): Promise<AiOutfit[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new GeminiGenerationError('request', 'MISSING_API_KEY', { message: 'ai_missing' });
  }

  const shopFor =
    params.gender === 'men'
      ? 'men'
      : params.gender === 'women'
        ? 'women'
        : 'any gender';

  const includeShoes = params.footwearPreference !== 'none';
  const system = stylistSystemPrompt({
    shopFor,
    includeShoes,
    complexion: params.colorPreference === 'complexion',
    rebuild: params.previousOutfit.length > 0,
  });

  const user = {
    style: params.style,
    occasion: params.occasion,
    shop_for: shopFor,
    skin_tone: params.skinTone,
    color_preference: params.colorPreference,
    budget: params.budget.outfit,
    shoe_budget: includeShoes ? params.budget.shoes : null,
    footwear_preference: params.footwearPreference,
    exclude_product_ids: params.excludeIds,
    previous_outfit_product_ids: params.previousOutfit.map((item) => item.product_id),
    previous_outfit: params.previousOutfit,
    attempt: params.attempt,
    stricter: params.stricter,
    instruction: params.stricter
      ? 'Previous attempt exceeded budget or was invalid. Propose up to 5 cheaper compatible outfits and omit optional items if needed.'
      : params.previousOutfit.length
        ? REBUILD_OUTFIT_INSTRUCTION
        : 'Build the strongest complete outfits from these actual products. Do not fill slots with weak pieces.',
    measurements: params.context.measurements,
    inspiration: params.context.inspiration,
    candidates: params.candidates,
  };

  const temperature = params.stricter ? 0.2 : params.previousOutfit.length ? 0.85 : 0.75;
  let http;
  try {
    http = await generateGeminiContent({
      apiKey,
      models: geminiModelsFromEnv(Deno.env),
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(user) }] }],
      generationConfig: geminiJsonGenerationConfig(temperature),
    });
  } catch {
    throw new GeminiGenerationError('request', 'NETWORK', {
      message: 'ai',
    });
  }

  if (!http.ok) {
    throw new GeminiGenerationError('request', http.error_type, {
      message: 'ai',
      status_code: http.status,
    });
  }

  const extracted = inspectGeminiPayload(http.payload);
  if (!extracted.text.trim()) {
    throw new GeminiGenerationError(
      'response',
      extracted.blockReason
        ? `BLOCKED_${extracted.blockReason}`
        : extracted.finishReason
          ? `EMPTY_TEXT_${extracted.finishReason}`
          : 'EMPTY_TEXT',
      {
        message: 'invalid_ai',
        finish_reason: extracted.finishReason ?? extracted.blockReason ?? undefined,
        candidate_count: extracted.candidateCount,
      },
    );
  }

  const parsed = tryParseGeminiOutfitCandidates(extracted.text, { requireShoes: includeShoes });
  if (!parsed.ok) {
    throw new GeminiGenerationError(parsed.stage, parsed.error_type, {
      message: 'invalid_ai',
      candidate_count: parsed.candidate_count,
    });
  }
  return parsed.outfits;
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
  footwearPreference: FootwearPreference = 'include',
  colorPreference: ColorPreference = 'style_first',
  previousOutfit: PreviousOutfitItem[] = [],
): AiOutfit {
  const styleTags = styleAliasTags(style);
  const scoreOf = (product: Product) =>
    relevanceScore(product, styleTags, occasion) +
    skinToneColorScore(product, skinTone, colorPreference);
  const grouped = groupByCategory(candidates);

  const rank = (list: Product[]) =>
    [...list].sort(
      (a, b) => scoreOf(b) - scoreOf(a) || asNumber(a.price) - asNumber(b.price),
    );

  const tops = rank(grouped.top).slice(0, 10);
  const bottoms = rank(grouped.bottom).slice(0, 10);
  const includeShoes = footwearPreference !== 'none';
  const shoes = includeShoes ? rank(grouped.shoes).slice(0, 10) : [];

  type Combo = {
    top: Product;
    bottom: Product;
    shoes: Product | null;
    total: number;
    styleScore: number;
    overlap: number;
  };
  const combos: Combo[] = [];
  for (const top of tops) {
    for (const bottom of bottoms) {
      if (!includeShoes) {
        if (fitsBudget(budget, [top, bottom])) {
          const pieces = [top, bottom];
          combos.push({
            top,
            bottom,
            shoes: null,
            total: asNumber(top.price) + asNumber(bottom.price),
            styleScore: scoreOf(top) + scoreOf(bottom),
            overlap:
              pieces.filter((product) => reusePenalty(product, previousOutfit) >= IDENTITY_REUSE_PENALTY).length +
              pieces.filter((product) => excludeIds.has(product.id)).length,
          });
        }
        continue;
      }
      for (const shoe of shoes) {
        if (fitsBudget(budget, [top, bottom, shoe])) {
          const pieces = [top, bottom, shoe];
          combos.push({
            top,
            bottom,
            shoes: shoe,
            total: asNumber(top.price) + asNumber(bottom.price) + asNumber(shoe.price),
            styleScore: scoreOf(top) + scoreOf(bottom) + scoreOf(shoe),
            overlap:
              pieces.filter((product) => reusePenalty(product, previousOutfit) >= IDENTITY_REUSE_PENALTY).length +
              pieces.filter((product) => excludeIds.has(product.id)).length,
          });
        }
      }
    }
  }

  if (!combos.length) {
    throw new Error('no_products');
  }

  const fresh = combos.filter((combo) => {
    const ids = [combo.top.id, combo.bottom.id, combo.shoes?.id].filter(
      (id): id is string => Boolean(id),
    );
    return !(excludeIds.size && ids.every((id) => excludeIds.has(id)));
  });
  const ranked = fresh.length ? fresh : combos;
  const bestScore = Math.max(...ranked.map((combo) => combo.styleScore));
  const qualityFloor = previousOutfit.length ? bestScore - SHORTLIST_QUALITY_BAND : bestScore - 1;
  const qualityBand = ranked.filter((combo) => combo.styleScore >= qualityFloor);
  const pickFromBand = qualityBand.length ? qualityBand : ranked;
  const chosen = previousOutfit.length
    ? [...pickFromBand].sort((a, b) => {
        const piecesOf = (combo: typeof a) =>
          [combo.top, combo.bottom, ...(combo.shoes ? [combo.shoes] : [])];
        const diversityDelta =
          outfitDiversityScore(piecesOf(b), previousOutfit, footwearPreference) -
          outfitDiversityScore(piecesOf(a), previousOutfit, footwearPreference);
        if (diversityDelta !== 0) return diversityDelta;
        if (b.styleScore !== a.styleScore) return b.styleScore - a.styleScore;
        return a.total - b.total;
      })[0]
    : (() => {
        const minOverlap = Math.min(...pickFromBand.map((combo) => combo.overlap));
        const band = pickFromBand.filter((combo) => combo.overlap === minOverlap);
        return band[(vibeSeed(style, occasion) + attempt) % band.length];
      })();

  const items: AiItem[] = [
    {
      product_id: chosen.top.id,
      reason: `Anchors the ${style} vibe for ${occasion}.`,
    },
    {
      product_id: chosen.bottom.id,
      reason: `Balances the fit for a ${occasion.toLowerCase()} look.`,
    },
  ];
  if (chosen.shoes) {
    items.push({
      product_id: chosen.shoes.id,
      reason: `Grounds the outfit without breaking the budget.`,
    });
  }

  let remaining =
    budget.outfit - outfitSpend(budget, [chosen.top, chosen.bottom, ...(chosen.shoes ? [chosen.shoes] : [])]);
  for (const category of OPTIONAL_CATEGORIES) {
    const optional = rank(grouped[category]).find(
      (product) =>
        !excludeIds.has(product.id) &&
        asNumber(product.price) <= remaining &&
        (footwearPreference !== 'none' || !isFootwearProduct(product)),
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

function canBuildCoreOutfit(
  candidates: Product[],
  budget: BudgetPlan,
  footwearPreference: FootwearPreference = 'include',
): boolean {
  const grouped = groupByCategory(candidates);
  if (footwearPreference === 'none') {
    for (const top of grouped.top) {
      for (const bottom of grouped.bottom) {
        if (fitsBudget(budget, [top, bottom])) return true;
      }
    }
    return false;
  }
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
  footwearPreference: FootwearPreference = 'include',
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

  assertValidOutfitCategories(seenCategories, footwearPreference);
  assertNoForbiddenFootwear(
    selected.map((entry) => entry.product),
    footwearPreference,
  );

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

  const requestStarted = perfNow();
  resetPerfLog();
  const traceId = createGenerationTraceId();
  console.log(`[GEN_TRACE] id=${traceId}`);
  const finish = (response: Response): Response => {
    logSkippedPerfStages();
    logPerfTotal(perfNow() - requestStarted);
    return response;
  };

  try {
    const stylingStarted = perfNow();
    genLog('GEN_STAGE', traceId, { stage: 'request' });
    const body = (await req.json()) as GenerateRequest;
    const style = typeof body.style === 'string' ? body.style.trim() : '';
    const occasion = typeof body.occasion === 'string' ? body.occasion.trim() : '';
    const outfitBudget = asNumber(body.budget);
    const shoeBudget =
      body.shoe_budget === null || body.shoe_budget === undefined
        ? null
        : asNumber(body.shoe_budget);
    const previousOutfit = parsePreviousOutfit(
      Array.isArray(body.previous_outfit) && body.previous_outfit.length
        ? body.previous_outfit
        : (body.previous_outfit_product_ids?.length
          ? body.previous_outfit_product_ids
          : body.exclude_product_ids),
    );
    const excludeIds = new Set<string>();

    if (
      !style ||
      !occasion ||
      !Number.isFinite(outfitBudget) ||
      outfitBudget <= 0 ||
      (shoeBudget !== null && (!Number.isFinite(shoeBudget) || shoeBudget <= 0))
    ) {
      logPerf('styling_context', perfNow() - stylingStarted);
      return finish(friendlyError('invalid_ai', 400));
    }
    const budget: BudgetPlan = { outfit: outfitBudget, shoes: shoeBudget };

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('EXPO_PUBLIC_SUPABASE_URL');
    const serviceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey) {
      logPerf('styling_context', perfNow() - stylingStarted);
      return finish(friendlyError('network', 500));
    }

    // Local PostgREST proxy expects /rest/v1 — createClient already adds that.
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const context = readStylingContext(body);
    const gender: GenderPreference =
      body.gender === 'men' || body.gender === 'women' ? body.gender : 'any';
    const skinTone = parseSkinTone(body.skin_tone);
    const footwearPreference = parseFootwearPreference(body.footwear_preference);
    const colorPreference = parseColorPreference(body.color_preference);
    const requiredCategories = requiredOutfitCategories(footwearPreference);
    const selectingBrands = context.preferredBrands.length > 0;
    const localFn = Number.isFinite(Number(Deno.env.get('EDGE_FUNCTION_PORT') ?? ''));
    if (footwearPreference === 'none') {
      budget.shoes = null;
    }
    logPerf('styling_context', perfNow() - stylingStarted);
    genLog('GEN_STAGE', traceId, {
      stage: 'styling_context',
      footwear: footwearPreference,
      rebuild: previousOutfit.length > 0,
    });

    const logChannel3 = (live: LiveRetrieval, source: string) => {
      const categories = live.categories;
      genLog('GEN_CHANNEL3', traceId, {
        used: live.ok,
        reason: live.reason ?? 'unknown_error',
        source,
        fetched: live.fetched,
        usable: live.usable,
        top: categories.top,
        bottom: categories.bottom,
        shoes: footwearPreference === 'none' ? 0 : categories.shoes,
        timed_out: live.timedOut,
      });
      if (live.attempted && live.ok) logMetadataPreservation(traceId, live.metadata);
    };

    const fetchLiveCatalogOnce = async (): Promise<LiveRetrieval> => {
      const apiKey = readChannel3ApiKey({ get: (name) => Deno.env.get(name) });
      if (!apiKey) {
        return emptyLiveRetrieval('no_api_key');
      }
      try {
        return await retrieveLiveChannel3Catalog({
          backend: createChannel3SearchBackend(new Channel3Client(apiKey)),
          style,
          occasion,
          gender,
          budget: budget.outfit,
          shoeBudget: budget.shoes,
          brands: context.preferredBrands,
          categories: liveRetrievalCategories(footwearPreference),
        });
      } catch (err) {
        return liveRetrievalFromError(
          err instanceof Error && err.message === 'timeout' ? 'request_timeout' : 'request_error',
        );
      }
    };
    const retrieveLiveOnce = (() => {
      let cached: Promise<LiveRetrieval> | null = null;
      return () => {
        if (!cached) {
          cached = (async () => {
            const started = perfNow();
            try {
              return await fetchLiveCatalogOnce();
            } finally {
              logPerf('channel3_retrieval', perfNow() - started);
            }
          })();
        }
        return cached;
      };
    })();

    let candidateFilteringMs = 0;
    const resolved = await resolveGenerationCatalog({
      retrieveLive: retrieveLiveOnce,
      loadStored: () =>
        loadCatalog(supabase, {
          scope: { brandNames: context.preferredBrands, requestedBrands: context.requestedBrands },
          gender,
          maxPrice: Math.max(budget.outfit, budget.shoes ?? 0),
          allowDemo: Deno.env.get('ALLOW_DEMO_CATALOG') === 'true' || localFn,
        }),
      isSufficient: (incoming) => {
        const started = perfNow();
        try {
          const filtered = shortlistForGemini({
            products: incoming,
            style,
            occasion,
            budget,
            excludeIds,
            skinTone,
            footwearPreference,
            colorPreference,
            previousOutfit,
          });
          const groupedLive = groupByCategory(filtered);
          return (
            !requiredCategories.some((required) => groupedLive[required].length === 0) &&
            canBuildCoreOutfit(filtered, budget, footwearPreference)
          );
        } finally {
          candidateFilteringMs += perfNow() - started;
        }
      },
      required: requiredCategories,
      excludeCategories: footwearPreference === 'none' ? ['shoes'] : [],
    });

    if (resolved.live) logChannel3(resolved.live, resolved.retrievalSource);
    else genLog('GEN_CHANNEL3', traceId, { used: false, reason: 'no_api_key', source: resolved.retrievalSource });

    if (!resolved.products.length) {
      if (resolved.fallbackReason === 'network') return finish(friendlyError('network', 500));
      if (resolved.fallbackReason === 'brands_unavailable' || resolved.fallbackReason === 'catalog_empty') {
        return finish(friendlyError(resolved.fallbackReason, 404, {
          unavailable_brands: resolved.unavailableBrands,
        }));
      }
    }

    const products = resolved.products;
    const brandsNoFit = (candidatePool: Product[]) => {
      const regrouped = groupByCategory(candidatePool);
      return finish(friendlyError(selectingBrands ? 'brands_no_fit' : 'no_products', 404, {
        missing_categories: requiredCategories.filter((c) => regrouped[c].length === 0),
        unavailable_brands: resolved.unavailableBrands,
      }));
    };

    const before = groupByCategory(products);
    const filterStarted = perfNow();
    const rankedResult = rankWorkingPoolDetailed({
      products,
      style,
      occasion,
      budget,
      excludeIds,
      skinTone,
      footwearPreference,
      colorPreference,
      previousOutfit,
    });
    const rankedPool = rankedResult.products.filter(
      (product) => footwearPreference !== 'none' || !isFootwearProduct(product),
    );
    const afterRank = groupByCategory(rankedPool);
    genLog('GEN_FILTER', traceId, {
      before_top: before.top.length,
      before_bottom: before.bottom.length,
      before_shoes: footwearPreference === 'none' ? 0 : before.shoes.length,
      after_top: afterRank.top.length,
      after_bottom: afterRank.bottom.length,
      after_shoes: footwearPreference === 'none' ? 0 : afterRank.shoes.length,
    });
    for (const drop of rankedResult.drops) {
      genLog('GEN_FILTER_DROP', traceId, {
        category: drop.category,
        product_id: drop.product_id,
        brand: drop.brand,
        reason: drop.reason,
        score: drop.score ?? 'none',
      });
    }

    if (
      requiredCategories.some((required) => afterRank[required].length === 0) ||
      !canBuildCoreOutfit(rankedPool, budget, footwearPreference)
    ) {
      candidateFilteringMs += perfNow() - filterStarted;
      logPerf('candidate_filtering', candidateFilteringMs);
      return brandsNoFit(rankedPool);
    }

    const visual = await enrichProductsWithVisualAttributes(rankedPool, {
      footwearPreference,
      onFailure: (failure) =>
        genLog('GEN_VISUAL_ERROR', traceId, {
          product_id: failure.product_id,
          stage: failure.stage,
          error_type: failure.error_type,
          status_code: failure.status_code,
          message: failure.message,
        }),
    });
    genLog('GEN_VISUAL', traceId, { analyzed: visual.successful, failed: visual.failed });

    const workingCandidates = shortlistForGemini({
      products: visual.products,
      style,
      occasion,
      budget,
      excludeIds,
      skinTone,
      footwearPreference,
      colorPreference,
      previousOutfit,
    }).filter((product) => footwearPreference !== 'none' || !isFootwearProduct(product));
    candidateFilteringMs += perfNow() - filterStarted;
    logPerf('candidate_filtering', candidateFilteringMs);

    const grouped = groupByCategory(workingCandidates);
    if (
      requiredCategories.some((required) => grouped[required].length === 0) ||
      !canBuildCoreOutfit(workingCandidates, budget, footwearPreference)
    ) {
      return brandsNoFit(workingCandidates);
    }

    const poolBrands = new Set(workingCandidates.map((product) => product.brand).filter(Boolean));
    genLog('GEN_GEMINI', traceId, {
      products_sent: workingCandidates.length,
      top_count: grouped.top.length,
      bottom_count: grouped.bottom.length,
      shoes_count: footwearPreference === 'none' ? 0 : grouped.shoes.length,
      brands: poolBrands.size,
    });
    for (const snapshot of poolSnapshotRows(workingCandidates, style, occasion, previousOutfit)) {
      logGeminiPool(
        traceId,
        snapshot.category,
        snapshot.rows.map((row) => ({
          product_id: row.product_id,
          category: row.category,
          brand: row.brand,
          price: row.price,
          relevance_score: row.relevance_score,
          style_score: row.style_score,
          occasion_score: row.occasion_score,
          visual_confidence: row.visual_confidence,
          shortlist_rank: row.shortlist_rank,
        })),
      );
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
          previousOutfit: previousOutfitForPrompt(previousOutfit, workingCandidates),
          attempt,
          stricter,
          context,
          gender,
          skinTone,
          footwearPreference,
          colorPreference,
        };
        const heuristicArgs = [
          style,
          occasion,
          budget,
          workingCandidates,
          excludeIds,
          attempt - 1,
          skinTone,
          footwearPreference,
          colorPreference,
          previousOutfit,
        ] as const;
        const productMap = new Map(
          workingCandidates.map((product) => [product.id, product]),
        );
        const scoringContext = {
          style,
          occasion,
          skinTone,
          measurements: context.measurements,
          footwearPreference,
          colorPreference,
        };
        let validationMs = 0;
        let scoringMs = 0;
        const evaluate = (outfits: AiOutfit[]) =>
          evaluateOutfitCandidates({
            outfits,
            excludeIds,
            validate: (outfit) => {
              const started = perfNow();
              try {
                return validateAndBuild(outfit, productMap, budget, footwearPreference);
              } finally {
                validationMs += perfNow() - started;
              }
            },
            productsOf: (built) => built.selected.map(({ product }) => product),
            score: (products) => {
              const started = perfNow();
              try {
                return scoreOutfit(products, scoringContext);
              } finally {
                scoringMs += perfNow() - started;
              }
            },
            previousOutfit,
            footwearPreference,
          });

        let geminiOutfits: AiOutfit[] | null = null;
        let geminiCallError: GeminiGenerationError | null = null;
        if (hasGemini) {
          const generationStarted = perfNow();
          try {
            geminiOutfits = await callGemini(geminiArgs);
          } catch (err) {
            geminiCallError =
              err instanceof GeminiGenerationError
                ? err
                : new GeminiGenerationError('request', 'UNHANDLED', {
                    message: err instanceof Error ? err.message : 'ai',
                  });
            genLog('GEN_GEMINI_ERROR', traceId, {
              stage: geminiCallError.stage,
              error_type: geminiCallError.error_type,
              status_code: geminiCallError.status_code,
              candidate_count: geminiCallError.candidate_count ?? 0,
              finish_reason: geminiCallError.finish_reason,
            });
            if (!allowHeuristic) throw err;
          } finally {
            logPerf('outfit_generation', perfNow() - generationStarted);
          }
        } else if (!allowHeuristic) {
          throw new Error('ai_missing');
        } else {
          logPerf('outfit_generation', 'SKIPPED');
        }

        let evaluated = geminiOutfits ? evaluate(geminiOutfits) : null;
        genLog('GEN_GEMINI', traceId, {
          generated: geminiOutfits?.length ?? 0,
          candidates_generated: geminiOutfits?.length ?? 0,
        });
        if (evaluated) {
          const valid = evaluated.candidates.filter((candidate) => candidate.valid);
          genLog('GEN_VALIDATE', traceId, {
            valid: valid.length,
            invalid: evaluated.candidates.length - valid.length,
          });
          if (geminiOutfits?.length && valid.length === 0) {
            genLog('GEN_GEMINI_ERROR', traceId, {
              stage: 'candidate_validation',
              error_type: 'all_candidates_invalid',
              candidate_count: geminiOutfits.length,
            });
          }
          logCandidateScores(
            traceId,
            evaluated.candidates.map((candidate) =>
              candidate.valid
                ? { index: candidate.index, valid: true, score: candidate.score }
                : { index: candidate.index, valid: false },
            ),
            evaluated.winner?.index ?? null,
          );
          logOutfitCandidates({
            count: evaluated.count,
            valid_count: valid.length,
            scores: valid.map((candidate) => candidate.score),
            selected_score: evaluated.winner?.score ?? null,
            invalid: evaluated.candidates
              .filter((candidate) => !candidate.valid)
              .map((candidate) => candidate.reason),
          });
          console.log(
            `[OUTFIT_DIVERSITY] ${JSON.stringify({
              rebuild: previousOutfit.length > 0,
              unique_candidate_products: uniqueProductIds(geminiOutfits ?? []).size,
              candidate_count: geminiOutfits?.length ?? 0,
            })}`,
          );
        }

        let usedHeuristicFallback = false;
        if (!evaluated?.winner && allowHeuristic) {
          usedHeuristicFallback = true;
          const reason = fallbackReasonForGemini({
            geminiOutfits,
            requestFailed: Boolean(geminiCallError && geminiCallError.stage === 'request'),
          });
          genLog('GEN_FALLBACK', traceId, {
            reason,
            mode: 'heuristic',
            top_candidates: grouped.top.length,
            bottom_candidates: grouped.bottom.length,
            shoe_candidates: footwearPreference === 'none' ? 0 : grouped.shoes.length,
          });
          const fallbackOutfit = heuristicOutfit(...heuristicArgs);
          const fallbackByCategory: Record<string, string> = {};
          for (const item of fallbackOutfit.items) {
            const product = productMap.get(item.product_id);
            if (!product) continue;
            fallbackByCategory[product.category] = product.id;
          }
          genLog('GEN_FALLBACK_SELECTION', traceId, {
            top: fallbackByCategory.top ?? 'none',
            bottom: fallbackByCategory.bottom ?? 'none',
            shoes: fallbackByCategory.shoes ?? 'none',
          });
          evaluated = evaluate([fallbackOutfit]);
        }

        logPerf('validation', validationMs);
        logPerf('scoring', scoringMs);

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
        const criticInput = {
          style,
          occasion,
          skinTone,
          measurements: context.measurements,
          season,
          footwearPreference,
          colorPreference,
          products: criticProductsFromCatalog(selected.map(({ product }) => product)),
        };
        const criticStarted = perfNow();
        const criticRaw = await critiqueWinningOutfit(criticInput, fashionAI);
        genLog('GEN_CRITIC', traceId, {
          ran: criticRaw.fashion_critic_available,
          assessment: criticRaw.fashion_critic?.overall_assessment ?? 'none',
        });
        if (!criticRaw.fashion_critic_available && criticRaw.reason === 'no_images') {
          logPerf('critic', 'SKIPPED');
        } else {
          logPerf('critic', perfNow() - criticStarted);
        }
        const critic = criticRaw.fashion_critic
          ? {
              ...criticRaw,
              fashion_critic: sanitizeCriticForFootwear(
                criticRaw.fashion_critic,
                footwearPreference,
              ),
            }
          : criticRaw;

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
              footwearPreference,
              colorPreference,
              currentOutfit: criticInput.products,
              critic: critic.fashion_critic ?? placeholderCritic,
              catalog: revisionCatalogFromProducts(workingCandidates),
            },
            provider: fashionAI,
            validate: (outfit) =>
              validateAndBuild(outfit, productMap, budget, footwearPreference),
            productsOf: (built) => built.selected.map(({ product }) => product),
            score: (products) => scoreOutfit(products, scoringContext),
            critique: async (input) => {
              const started = perfNow();
              try {
                const run = await critiqueWinningOutfit(input, fashionAI);
                if (!run.fashion_critic) return run;
                return {
                  ...run,
                  fashion_critic: sanitizeCriticForFootwear(
                    run.fashion_critic,
                    footwearPreference,
                  ),
                };
              } finally {
                logPerf('critic', perfNow() - started);
              }
            },
            criticInputFor: (products) => ({
              style,
              occasion,
              skinTone,
              measurements: context.measurements,
              season,
              footwearPreference,
              colorPreference,
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
        genLog('GEN_REVISION', traceId, {
          attempted: revisionFields.fashion_revision_attempted,
          accepted: revisionFields.fashion_revision_accepted,
        });

        if (revisionFields.fashion_revision_accepted) {
          logOutfitScore({
            score: finalFashion.score,
            style,
            occasion,
            breakdown: finalFashion.breakdown,
            issues: finalFashion.issues,
          });
        }

        const responseStarted = perfNow();
        const criticFields = toFashionCriticFields(finalCritic);
        const generationMode = generationModeForResponse(usedHeuristicFallback);
        logFinalOutfit(
          traceId,
          {
            source: resolved.retrievalSource,
            items: finalSelected.length,
            score: finalFashion.score,
            revision_attempted: revisionFields.fashion_revision_attempted,
            revision_accepted: revisionFields.fashion_revision_accepted,
            generation_mode: generationMode,
          },
          finalSelected.map(({ product }) => ({
            category: product.category,
            product_id: product.id,
            brand: product.brand,
            price: asNumber(product.price),
          })),
        );
        const response = jsonResponse({
          outfit_name: finalName,
          styling_tip: finalTip,
          style,
          occasion,
          budget: budget.outfit,
          shoe_budget: budget.shoes,
          total_price: finalTotal,
          catalog_source: resolved.retrievalSource,
          channel3_retrieval_attempted: resolved.channel3Attempted,
          generation_mode: generationMode,
          footwear_preference: footwearPreference,
          unavailable_brands: resolved.unavailableBrands,
          outfit_diversity_score: outfitDiversityScore(
            finalSelected.map(({ product }) => product),
            previousOutfit,
            footwearPreference,
          ),
          ...toFashionResponseFields(finalFashion),
          ...criticFields,
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
        logPerf('response_construction', perfNow() - responseStarted);
        return finish(response);
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'unknown';
        if (lastError === 'ai_missing') {
          return finish(friendlyError('ai', 500));
        }
        // Keep retrying for no_products/budget/invalid_ai within MAX_ATTEMPTS
        continue;
      }
    }

    if (lastError === 'budget') return finish(friendlyError('budget', 422));
    if (lastError === 'ai') return finish(friendlyError('ai', 502));
    return finish(friendlyError('invalid_ai', 422));
  } catch {
    return finish(friendlyError('unknown', 500));
  }
}

const localPort = Number(Deno.env.get('EDGE_FUNCTION_PORT') ?? '');
if (Number.isFinite(localPort) && localPort > 0) {
  Deno.serve({ port: localPort, hostname: '127.0.0.1' }, handler);
} else {
  Deno.serve(handler);
}
