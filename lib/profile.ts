import { getSupabase } from '@/lib/supabase';
import type { Occasion, Style } from '@/types';
import type { Profile } from '@/types/database';

export async function fetchProfile(): Promise<Profile | null> {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error("Couldn't load your profile.");
  }

  return data;
}

export async function updateProfilePreferences(params: {
  preferredStyles: Style[];
  preferredOccasions: Occasion[];
  onboardingCompleted?: boolean;
}): Promise<void> {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    throw new Error('Sign in to update preferences.');
  }

  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    email: user.email ?? null,
    preferred_styles: params.preferredStyles.map((style) => style.toLowerCase()),
    preferred_occasions: params.preferredOccasions.map((occasion) =>
      occasion.toLowerCase(),
    ),
    onboarding_completed: params.onboardingCompleted ?? true,
  });

  if (error) {
    throw new Error("Couldn't update preferences.");
  }
}
