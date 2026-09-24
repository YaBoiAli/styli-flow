import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { BrandRequest } from '@/types';

const STORAGE_KEY = 'styli.brandRequests.v1';

export async function loadBrandRequests(): Promise<BrandRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as BrandRequest[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Record a brand the user asked for. Saved on-device first so the request is
 * never lost, then sent to Supabase for review when the backend is reachable.
 */
export async function submitBrandRequest(
  request: BrandRequest,
  userId?: string | null,
): Promise<void> {
  try {
    const existing = await loadBrandRequests();
    const next = [
      ...existing.filter((entry) => entry.id !== request.id),
      request,
    ];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Local persistence is best-effort; the request still lives in app state.
  }

  if (!isSupabaseConfigured()) return;
  try {
    await getSupabase().from('brand_requests').insert({
      id: request.id,
      user_id: userId ?? null,
      brand_name: request.name,
      website_url: request.website,
    });
  } catch {
    // Review queue sync is best-effort until the table is deployed.
  }
}
