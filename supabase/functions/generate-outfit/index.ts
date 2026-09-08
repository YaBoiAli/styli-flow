import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { corsHeaders, friendlyError, jsonResponse } from '../_shared/cors.ts';

type ProductCategory = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';

type Product = {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  price: number;
  color: string;
  image_url: string;
  purchase_url: string;
  style_tags: string[];
  occasion_tags: string[];
};

type GenerateRequest = {
  style: string;
  occasion: string;
  budget: number;
  exclude_product_ids?: string[];
};

type AiItem = {
  product_id: string;
  reason: string;
};

type AiOutfit = {
  outfit_name: string;
  items: AiItem[];
  styling_tip: string;
};

const REQUIRED_CATEGORIES: ProductCategory[] = ['top', 'bottom', 'shoes'];
const OPTIONAL_CATEGORIES: ProductCategory[] = ['outerwear', 'accessory'];
const MAX_ATTEMPTS = 3;
const MAX_CANDIDATES_PER_CATEGORY = 8;

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
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

function filterCandidates(
  products: Product[],
  style: string,
  occasion: string,
  budget: number,
  excludeIds: Set<string>,
): Product[] {
  const styleTag = normalizeTag(style);
  const occasionTag = normalizeTag(occasion);

  const styleMatched = products.filter((product) => {
    if (excludeIds.has(product.id)) return false;
    if (asNumber(product.price) > budget) return false;
    return product.style_tags.some((tag) => normalizeTag(tag) === styleTag);
  });

  const occasionMatched = styleMatched.filter((product) =>
    product.occasion_tags.some((tag) => normalizeTag(tag) === occasionTag),
  );

  // Prefer occasion overlap, but keep style matches if occasion is sparse.
  const pool = occasionMatched.length >= 6 ? occasionMatched : styleMatched;

  const grouped = groupByCategory(pool);
  const trimmed: Product[] = [];

  for (const category of [...REQUIRED_CATEGORIES, ...OPTIONAL_CATEGORIES]) {
    const ranked = [...grouped[category]].sort((a, b) => {
      const aOcc = a.occasion_tags.some((tag) => normalizeTag(tag) === occasionTag)
        ? 0
        : 1;
      const bOcc = b.occasion_tags.some((tag) => normalizeTag(tag) === occasionTag)
        ? 0
        : 1;
      if (aOcc !== bOcc) return aOcc - bOcc;
      return asNumber(a.price) - asNumber(b.price);
    });
    trimmed.push(...ranked.slice(0, MAX_CANDIDATES_PER_CATEGORY));
  }

  return trimmed;
}

function candidatesForPrompt(products: Product[]) {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    price: asNumber(product.price),
    color: product.color,
    style_tags: product.style_tags,
    occasion_tags: product.occasion_tags,
  }));
}

function parseAiJson(content: string): AiOutfit {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(raw) as AiOutfit;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('invalid_ai');
  }
  if (typeof parsed.outfit_name !== 'string' || !parsed.outfit_name.trim()) {
    throw new Error('invalid_ai');
  }
  if (typeof parsed.styling_tip !== 'string' || !parsed.styling_tip.trim()) {
    throw new Error('invalid_ai');
  }
  if (!Array.isArray(parsed.items) || parsed.items.length < 3) {
    throw new Error('invalid_ai');
  }
  for (const item of parsed.items) {
    if (!item || typeof item.product_id !== 'string' || !item.product_id) {
      throw new Error('invalid_ai');
    }
    if (typeof item.reason !== 'string') {
      throw new Error('invalid_ai');
    }
  }
  return parsed;
}

async function callOpenAI(params: {
  style: string;
  occasion: string;
  budget: number;
  candidates: ReturnType<typeof candidatesForPrompt>;
  excludeIds: string[];
  attempt: number;
  stricter: boolean;
}): Promise<AiOutfit> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('openai_missing');
  }

  const system = `You are Styli, an expert fashion stylist.
Choose a complete outfit ONLY from the provided candidate products.
Never invent products, IDs, names, or prices.
Return ONLY valid JSON with this shape:
{
  "outfit_name": string,
  "items": [{ "product_id": string, "reason": string }],
  "styling_tip": string
}
Rules:
- Include exactly one top, one bottom, and one shoes item.
- Optionally include one outerwear and/or one accessory ONLY if the outfit still stays within budget.
- Every product_id must come from the candidate list.
- Prefer cohesive color/style for the requested vibe and occasion.
- Keep the total of selected candidate prices <= budget.
- Do not include duplicate categories.`;

  const user = {
    style: params.style,
    occasion: params.occasion,
    budget: params.budget,
    exclude_product_ids: params.excludeIds,
    attempt: params.attempt,
    stricter: params.stricter,
    instruction: params.stricter
      ? 'Previous attempt exceeded budget or was invalid. Choose cheaper compatible pieces and omit optional items if needed.'
      : 'Build the best outfit within budget.',
    candidates: params.candidates,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini',
      temperature: params.stricter ? 0.2 : 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(user) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error('openai');
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('invalid_ai');
  }

  return parseAiJson(content);
}

/**
 * Deterministic local stylist used only when OPENAI_API_KEY is unset and
 * ALLOW_HEURISTIC_FALLBACK=true (local Stage 3 testing). Production must set OPENAI_API_KEY.
 */
function heuristicOutfit(
  style: string,
  occasion: string,
  budget: number,
  candidates: Product[],
  excludeIds: Set<string>,
  attempt: number,
): AiOutfit {
  const styleTag = normalizeTag(style);
  const grouped = groupByCategory(
    candidates.filter((product) => !excludeIds.has(product.id)),
  );

  const rank = (list: Product[]) =>
    [...list].sort((a, b) => {
      const aPrimary = a.style_tags[0] && normalizeTag(a.style_tags[0]) === styleTag ? 0 : 1;
      const bPrimary = b.style_tags[0] && normalizeTag(b.style_tags[0]) === styleTag ? 0 : 1;
      if (aPrimary !== bPrimary) return aPrimary - bPrimary;
      return asNumber(a.price) - asNumber(b.price);
    });

  const tops = rank(grouped.top);
  const bottoms = rank(grouped.bottom);
  const shoes = rank(grouped.shoes);

  type Combo = { top: Product; bottom: Product; shoes: Product; total: number };
  const combos: Combo[] = [];
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        const total =
          asNumber(top.price) + asNumber(bottom.price) + asNumber(shoe.price);
        if (total <= budget) {
          combos.push({ top, bottom, shoes: shoe, total });
        }
      }
    }
  }

  if (!combos.length) {
    throw new Error('no_products');
  }

  combos.sort((a, b) => {
    const score = (combo: Combo) =>
      [combo.top.id, combo.bottom.id, combo.shoes.id].filter((id) =>
        excludeIds.has(id),
      ).length;
    const overlapDiff = score(a) - score(b);
    if (overlapDiff !== 0) return overlapDiff;
    return a.total - b.total;
  });
  const chosen = combos[Math.min(attempt, combos.length - 1)];

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

  let remaining = budget - chosen.total;
  for (const category of OPTIONAL_CATEGORIES) {
    const optional = rank(grouped[category]).find(
      (product) => asNumber(product.price) <= remaining,
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

function canBuildCoreOutfit(candidates: Product[], budget: number): boolean {
  const grouped = groupByCategory(candidates);
  for (const top of grouped.top) {
    for (const bottom of grouped.bottom) {
      for (const shoe of grouped.shoes) {
        const total =
          asNumber(top.price) + asNumber(bottom.price) + asNumber(shoe.price);
        if (total <= budget) return true;
      }
    }
  }
  return false;
}

function validateAndBuild(
  ai: AiOutfit,
  candidateMap: Map<string, Product>,
  budget: number,
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

  if (totalPrice > budget) {
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
    const budget = asNumber(body.budget);
    const excludeIds = new Set(
      (body.exclude_product_ids ?? []).filter((id) => typeof id === 'string'),
    );

    if (!style || !occasion || !Number.isFinite(budget) || budget <= 0) {
      return friendlyError('invalid_ai', 400);
    }

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

    const { data, error } = await supabase.from('products').select('*');
    if (error) {
      return friendlyError('network', 500);
    }

    const products = (data ?? []).map((row) => ({
      ...row,
      price: asNumber(row.price),
    })) as Product[];

    const candidates = filterCandidates(
      products,
      style,
      occasion,
      budget,
      excludeIds,
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
        );
      }
      const regrouped = groupByCategory(workingCandidates);
      if (
        REQUIRED_CATEGORIES.some((required) => regrouped[required].length === 0) ||
        !canBuildCoreOutfit(workingCandidates, budget)
      ) {
        return friendlyError('no_products', 404);
      }
    }

    const promptCandidates = candidatesForPrompt(workingCandidates);
    const allowHeuristic = Deno.env.get('ALLOW_HEURISTIC_FALLBACK') === 'true';
    const hasOpenAI = Boolean(Deno.env.get('OPENAI_API_KEY'));
    const excludedList = [...excludeIds];

    let lastError: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const stricter = attempt > 1;
        const ai = hasOpenAI
          ? await callOpenAI({
              style,
              occasion,
              budget,
              candidates: promptCandidates,
              excludeIds: excludedList,
              attempt,
              stricter,
            })
          : allowHeuristic
          ? heuristicOutfit(
              style,
              occasion,
              budget,
              workingCandidates,
              // On later attempts, soften excludes so a valid different combo can still form.
              attempt === 1 ? excludeIds : new Set(),
              attempt - 1,
            )
          : (() => {
              throw new Error('openai_missing');
            })();

        // Rebuild must not return an identical product set.
        if (excludeIds.size > 0) {
          const nextIds = ai.items.map((item) => item.product_id);
          const same =
            nextIds.length === excludeIds.size &&
            nextIds.every((id) => excludeIds.has(id));
          if (same) {
            throw new Error('invalid_ai');
          }
        }

        const { selected, totalPrice } = validateAndBuild(
          ai,
          new Map(workingCandidates.map((product) => [product.id, product])),
          budget,
        );

        return jsonResponse({
          outfit_name: ai.outfit_name,
          styling_tip: ai.styling_tip,
          style,
          occasion,
          budget,
          total_price: totalPrice,
          items: selected.map(({ product, reason }) => ({
            product_id: product.id,
            reason,
            product: {
              id: product.id,
              name: product.name,
              brand: product.brand,
              category: product.category,
              price: asNumber(product.price),
              color: product.color,
              image_url: product.image_url,
              purchase_url: product.purchase_url,
              style_tags: product.style_tags,
              occasion_tags: product.occasion_tags,
            },
          })),
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'unknown';
        if (lastError === 'openai_missing') {
          return friendlyError('openai', 500);
        }
        // Keep retrying for no_products/budget/invalid_ai within MAX_ATTEMPTS
        continue;
      }
    }

    if (lastError === 'budget') return friendlyError('budget', 422);
    if (lastError === 'openai') return friendlyError('openai', 502);
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
