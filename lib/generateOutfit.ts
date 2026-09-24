import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseUrl } from '@/lib/supabaseUrl';
import { toUiCategory } from '@/lib/outfitBuilder';
import type {
  BodyMeasurements,
  BrandRequest,
  GenderPreference,
  InspirationSource,
  Occasion,
  Outfit,
  Product,
  Style,
} from '@/types';

export type GenerateOutfitRequest = {
  style: Style;
  occasion: Occasion;
  budget: number;
  /** Separate cap for shoes; null/undefined means shoes are inside `budget`. */
  shoeBudget?: number | null;
  excludeProductIds?: string[];
  measurements?: BodyMeasurements | null;
  inspirationSources?: InspirationSource[];
  /** Empty means "No Preference". */
  selectedBrands?: string[];
  brandRequests?: BrandRequest[];
  gender?: GenderPreference;
  age?: number | null;
};

function measurementsPayload(measurements: BodyMeasurements | null | undefined) {
  if (!measurements) return null;
  return {
    unit: measurements.unit,
    height_cm: measurements.heightCm,
    weight_kg: measurements.weightKg,
    shoulders_cm: measurements.shouldersCm,
    chest_cm: measurements.chestCm,
    waist_cm: measurements.waistCm,
    hips_cm: measurements.hipsCm,
    thigh_cm: measurements.thighCm,
    inseam_cm: measurements.inseamCm,
  };
}

/** Local image URIs can't leave the device yet, so images travel as metadata. */
function inspirationPayload(sources: InspirationSource[] | undefined) {
  return (sources ?? []).map((source) =>
    source.kind === 'image'
      ? {
          type: 'image' as const,
          file_name: source.image.fileName,
          mime_type: source.image.mimeType,
          file_size: source.image.fileSize,
          width: source.image.width,
          height: source.image.height,
        }
      : { type: source.kind, url: source.url },
  );
}

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
  const supabaseUrl = getSupabaseUrl();
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
        shoe_budget: request.shoeBudget ?? null,
        exclude_product_ids: request.excludeProductIds ?? [],
        measurements: measurementsPayload(request.measurements),
        inspiration: inspirationPayload(request.inspirationSources),
        gender: request.gender ?? 'any',
        age: request.age ?? null,
        brand_preference: {
          mode: request.selectedBrands?.length ? 'selected' : 'no_preference',
          brands: request.selectedBrands ?? [],
          requested_brands: (request.brandRequests ?? []).map((brand) => ({
            name: brand.name,
            website: brand.website,
            status: brand.status,
          })),
        },
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
    const code = payload?.code ?? (response.status === 404 ? 'NOT_FOUND' : 'unknown');
    const payloadMessage =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: unknown }).message ?? '')
        : '';
    const remoteMissing =
      code === 'NOT_FOUND' || payloadMessage.toLowerCase().includes('function');
    throw new OutfitGenerationError(
      remoteMissing
        ? 'Your stylist service is offline. Deploy generate-outfit or point the app at the local proxy.'
        : typeof payload?.error === 'string'
          ? payload.error
          : FRIENDLY_FALLBACK,
      remoteMissing ? 'NOT_FOUND' : code,
    );
  }

  if (
    !payload?.outfit_name ||
    !Array.isArray(payload.items) ||
    payload.items.length < 3
  ) {
    throw new OutfitGenerationError(FRIENDLY_FALLBACK, 'invalid_ai');
  }

  if (
    Number(payload.total_price) >
    Number(request.budget) + Number(request.shoeBudget ?? 0)
  ) {
    throw new OutfitGenerationError(
      "Your stylist couldn't find the right fit within that budget. Try again.",
      'budget',
    );
  }

  return mapGenerateResponseToOutfit(payload, request.style, request.occasion);
}
