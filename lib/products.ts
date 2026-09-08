import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  buildUiOutfit,
  occasionToTag,
  styleToTag,
} from '@/lib/outfitBuilder';
import type { Occasion, Outfit, Style } from '@/types';
import type { Product as DbProduct } from '@/types/database';

export async function fetchProducts(): Promise<DbProduct[]> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const { data, error } = await getSupabase()
    .from('products')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  return (data ?? []) as DbProduct[];
}

export async function fetchProductsForPreferences(params: {
  style: Style;
  occasion: Occasion;
  budget: number;
}): Promise<DbProduct[]> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const styleTag = styleToTag(params.style);
  const occasionTag = occasionToTag(params.occasion);

  const { data, error } = await getSupabase()
    .from('products')
    .select('*')
    .contains('style_tags', [styleTag])
    .lte('price', params.budget)
    .order('price', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch styled products: ${error.message}`);
  }

  const rows = (data ?? []) as DbProduct[];

  const ranked = [...rows].sort((a, b) => {
    const aPrimary = a.style_tags[0]?.toLowerCase() === styleTag ? 0 : 1;
    const bPrimary = b.style_tags[0]?.toLowerCase() === styleTag ? 0 : 1;
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;

    const aOcc = a.occasion_tags.map((tag) => tag.toLowerCase()).includes(occasionTag)
      ? 0
      : 1;
    const bOcc = b.occasion_tags.map((tag) => tag.toLowerCase()).includes(occasionTag)
      ? 0
      : 1;
    if (aOcc !== bOcc) return aOcc - bOcc;

    return Number(a.price) - Number(b.price);
  });

  return ranked;
}

export async function buildOutfitFromCatalog(params: {
  style: Style;
  occasion: Occasion;
  budget: number;
}): Promise<Outfit> {
  const products = await fetchProductsForPreferences(params);

  if (products.length === 0) {
    // Broaden search if tag filters were too strict.
    const all = await fetchProducts();
    const styleTag = styleToTag(params.style);
    const filtered = all.filter((product) =>
      product.style_tags.map((tag) => tag.toLowerCase()).includes(styleTag),
    );
    return buildUiOutfit({ ...params, products: filtered.length ? filtered : all });
  }

  return buildUiOutfit({ ...params, products });
}
