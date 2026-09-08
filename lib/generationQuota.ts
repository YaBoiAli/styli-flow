import AsyncStorage from '@react-native-async-storage/async-storage';

import { FREE_GENERATION_LIMIT } from '@/constants/subscriptions';

const STORAGE_KEY = 'styli.generationCount.v1';

function keyForUser(userId: string | null | undefined): string {
  return `${STORAGE_KEY}:${userId ?? 'anonymous'}`;
}

export async function getGenerationCount(
  userId?: string | null,
): Promise<number> {
  const raw = await AsyncStorage.getItem(keyForUser(userId));
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export async function incrementGenerationCount(
  userId?: string | null,
): Promise<number> {
  const next = (await getGenerationCount(userId)) + 1;
  await AsyncStorage.setItem(keyForUser(userId), String(next));
  return next;
}

export async function resetGenerationCount(userId?: string | null): Promise<void> {
  await AsyncStorage.setItem(keyForUser(userId), '0');
}

export async function canGenerateOutfit(params: {
  isPremium: boolean;
  userId?: string | null;
}): Promise<{ allowed: boolean; remaining: number; used: number }> {
  if (params.isPremium) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, used: 0 };
  }

  const used = await getGenerationCount(params.userId);
  const remaining = Math.max(0, FREE_GENERATION_LIMIT - used);
  return {
    allowed: remaining > 0,
    remaining,
    used,
  };
}
