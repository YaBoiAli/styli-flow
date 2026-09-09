import { getSupabase } from '@/lib/supabase';
import { toUiCategory } from '@/lib/outfitBuilder';
import type { Occasion, Outfit, Product, Style } from '@/types';
import type { Product as DbProduct } from '@/types/database';

export type SavedOutfitSummary = {
  id: string;
  outfitName: string;
  style: string;
  occasion: string;
  totalPrice: number;
  stylingTip: string;
  createdAt: string;
  previewImages: string[];
};

export type SavedOutfitDetail = SavedOutfitSummary & {
  budget: number;
  products: Product[];
};

type OutfitRow = {
  id: string;
  outfit_name: string;
  style: string;
  occasion: string;
  budget: number;
  total_price: number;
  styling_tip: string;
  created_at: string;
  outfit_items?: Array<{
    reason: string;
    product_id: string;
    products: DbProduct | null;
  }>;
};

function mapProduct(product: DbProduct, reason: string): Product {
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

function mapSummary(row: OutfitRow): SavedOutfitSummary {
  const images =
    row.outfit_items
      ?.map((item) => item.products?.image_url)
      .filter((url): url is string => Boolean(url))
      .slice(0, 3) ?? [];

  return {
    id: row.id,
    outfitName: row.outfit_name,
    style: row.style,
    occasion: row.occasion,
    totalPrice: Number(row.total_price),
    stylingTip: row.styling_tip,
    createdAt: row.created_at,
    previewImages: images,
  };
}

export async function saveGeneratedOutfit(params: {
  outfit: Outfit;
  style: Style;
  occasion: Occasion;
  budget: number;
  userId: string;
}): Promise<string> {
  const supabase = getSupabase();

  const { data: outfitRow, error: outfitError } = await supabase
    .from('outfits')
    .insert({
      user_id: params.userId,
      outfit_name: params.outfit.name,
      style: params.style,
      occasion: params.occasion,
      budget: params.budget,
      total_price: params.outfit.total,
      styling_tip: params.outfit.explanation,
    })
    .select('id')
    .single();

  if (outfitError || !outfitRow) {
    throw new Error("Couldn't save that fit. Try again.");
  }

  const items = params.outfit.products.map((product) => ({
    outfit_id: outfitRow.id,
    product_id: product.id,
    reason: product.reason ?? '',
  }));

  const { error: itemsError } = await supabase.from('outfit_items').insert(items);
  if (itemsError) {
    await supabase.from('outfits').delete().eq('id', outfitRow.id);
    throw new Error("Couldn't save that fit. Try again.");
  }

  return outfitRow.id;
}

export async function fetchSavedOutfits(): Promise<SavedOutfitSummary[]> {
  const { data, error } = await getSupabase()
    .from('outfits')
    .select(
      `
      id,
      outfit_name,
      style,
      occasion,
      budget,
      total_price,
      styling_tip,
      created_at,
      outfit_items (
        reason,
        product_id,
        products (*)
      )
    `,
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error("Couldn't load saved fits.");
  }

  return ((data ?? []) as OutfitRow[]).map(mapSummary);
}

export async function countSavedOutfits(): Promise<number> {
  const { count, error } = await getSupabase()
    .from('outfits')
    .select('id', { count: 'exact', head: true });

  if (error) {
    throw new Error("Couldn't check saved fits.");
  }

  return count ?? 0;
}

export async function fetchSavedOutfit(id: string): Promise<SavedOutfitDetail> {
  const { data, error } = await getSupabase()
    .from('outfits')
    .select(
      `
      id,
      outfit_name,
      style,
      occasion,
      budget,
      total_price,
      styling_tip,
      created_at,
      outfit_items (
        reason,
        product_id,
        products (*)
      )
    `,
    )
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new Error("Couldn't open that fit.");
  }

  const row = data as OutfitRow;
  const products =
    row.outfit_items
      ?.map((item) =>
        item.products ? mapProduct(item.products, item.reason) : null,
      )
      .filter((product): product is Product => Boolean(product)) ?? [];

  return {
    ...mapSummary(row),
    budget: Number(row.budget),
    products,
  };
}

export async function deleteSavedOutfit(id: string): Promise<void> {
  const { error } = await getSupabase().from('outfits').delete().eq('id', id);
  if (error) {
    throw new Error("Couldn't delete that fit.");
  }
}

export function savedDetailToOutfit(detail: SavedOutfitDetail): Outfit {
  return {
    id: detail.id,
    name: detail.outfitName,
    style: detail.style as Style,
    occasion: detail.occasion as Occasion,
    products: detail.products,
    total: detail.totalPrice,
    explanation: detail.stylingTip,
  };
}
