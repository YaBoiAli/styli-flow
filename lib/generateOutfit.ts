import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { toUiCategory } from '@/lib/outfitBuilder';
import type { Occasion, Outfit, Product, Style } from '@/types';

export type GenerateOutfitRequest = {
  style: Style;
  occasion: Occasion;
  budget: number;
  excludeProductIds?: string[];
};

type EdgeProduct = {
  id: string;
  name: string;
  brand: string;
  category: 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';
  price: number;
  color: string;
  image_url: string;
  purchase_url: string;
  style_tags: string[];
  occasion_tags: string[];
};

type EdgeItem = {
  product_id: string;
  reason: string;
  product: EdgeProduct;
};

export type GenerateOutfitResponse = {
  outfit_name: string;
  styling_tip: string;
  style: string;
  occasion: string;
  budget: number;
  total_price: number;
  items: EdgeItem[];
  error?: string;
  code?: string;
};

export class OutfitGenerationError extends Error {
  code: string;

  constructor(message: string, code = 'unknown') {
    super(message);
    this.name = 'OutfitGenerationError';
    this.code = code;
  }
}

const FRIENDLY_FALLBACK =
  "Your stylist couldn't find the right fit. Try again.";

function toUiProduct(product: EdgeProduct, reason: string): Product {
  return {
    id: product.id,
    name: product.name,
    price: Number(product.price),
    imageUrl: product.image_url,
    category: toUiCategory(product.category),
    reason,
    purchaseUrl: product.purchase_url || undefined,
  };
}

export function mapGenerateResponseToOutfit(
  payload: GenerateOutfitResponse,
  style: Style,
  occasion: Occasion,
): Outfit {
  const products = payload.items.map((item) =>
    toUiProduct(item.product, item.reason),
  );

  return {
    id: `${style}-${occasion}-${payload.total_price}`
      .toLowerCase()
      .replace(/\s+/g, '-'),
    name: payload.outfit_name,
    style,
    occasion,
    products,
    total: Number(payload.total_price),
    explanation: payload.styling_tip,
    itemReasons: payload.items.map((item) => ({
      productId: item.product_id,
      reason: item.reason,
    })),
  };
}

export async function generateOutfit(
  request: GenerateOutfitRequest,
): Promise<Outfit> {
  if (!isSupabaseConfigured()) {
    throw new OutfitGenerationError(FRIENDLY_FALLBACK, 'network');
  }

  const supabase = getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new OutfitGenerationError(FRIENDLY_FALLBACK, 'network');
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/generate-outfit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session?.access_token ?? anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        style: request.style,
        occasion: request.occasion,
        budget: request.budget,
        exclude_product_ids: request.excludeProductIds ?? [],
      }),
    });
  } catch {
    throw new OutfitGenerationError(FRIENDLY_FALLBACK, 'network');
  }

  let payload: GenerateOutfitResponse | null = null;
  try {
    payload = (await response.json()) as GenerateOutfitResponse;
  } catch {
    throw new OutfitGenerationError(FRIENDLY_FALLBACK, 'invalid_ai');
  }

  if (!response.ok || payload?.error) {
    throw new OutfitGenerationError(
      typeof payload?.error === 'string' ? payload.error : FRIENDLY_FALLBACK,
      payload?.code ?? 'unknown',
    );
  }

  if (
    !payload?.outfit_name ||
    !Array.isArray(payload.items) ||
    payload.items.length < 3
  ) {
    throw new OutfitGenerationError(FRIENDLY_FALLBACK, 'invalid_ai');
  }

  if (Number(payload.total_price) > Number(request.budget)) {
    throw new OutfitGenerationError(
      "Your stylist couldn't find the right fit within that budget. Try again.",
      'budget',
    );
  }

  return mapGenerateResponseToOutfit(payload, request.style, request.occasion);
}
