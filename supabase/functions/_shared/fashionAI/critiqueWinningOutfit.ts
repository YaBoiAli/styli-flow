import { criticImageUrls } from './criticInput.ts';
import type {
  FashionAIProvider,
  FashionCriticAttachment,
  FashionCriticInput,
  FashionCriticResult,
} from './types.ts';

export type CriticRunResult = FashionCriticAttachment & {
  reason?: string;
  image_count: number;
};

export function logOutfitCritic(input: {
  available: boolean;
  assessment?: string;
  style_match?: number;
  color_harmony?: number;
  proportion?: number;
  occasion_match?: number;
  cohesion?: number;
  image_count: number;
  reason?: string;
}): void {
  if (input.available) {
    console.log(
      `[OUTFIT_CRITIC] ${JSON.stringify({
        available: true,
        assessment: input.assessment,
        style_match: input.style_match,
        color_harmony: input.color_harmony,
        proportion: input.proportion,
        occasion_match: input.occasion_match,
        cohesion: input.cohesion,
        image_count: input.image_count,
      })}`,
    );
    return;
  }
  console.log(
    `[OUTFIT_CRITIC] ${JSON.stringify({
      available: false,
      reason: input.reason ?? 'unavailable',
    })}`,
  );
}

export function toFashionCriticFields(run: CriticRunResult): FashionCriticAttachment {
  return run.available && run.fashion_critic
    ? { fashion_critic_available: true, fashion_critic: run.fashion_critic }
    : { fashion_critic_available: false };
}

/**
 * Advisory critic for the Phase 2A winner only. Never throws.
 * Does not change fashion_score or selection.
 */
export async function critiqueWinningOutfit(
  input: FashionCriticInput,
  provider: FashionAIProvider,
): Promise<CriticRunResult> {
  const imageCount = criticImageUrls(input.products).length;
  if (!imageCount) {
    const skipped: CriticRunResult = {
      fashion_critic_available: false,
      reason: 'no_images',
      image_count: 0,
    };
    logOutfitCritic({ available: false, reason: 'no_images', image_count: 0 });
    return skipped;
  }

  let result: FashionCriticResult | null = null;
  try {
    result = await provider.critiqueOutfit(input);
  } catch {
    logOutfitCritic({ available: false, reason: 'provider_error', image_count: imageCount });
    return { fashion_critic_available: false, reason: 'provider_error', image_count: imageCount };
  }

  if (!result) {
    logOutfitCritic({ available: false, reason: 'invalid_critic', image_count: imageCount });
    return { fashion_critic_available: false, reason: 'invalid_critic', image_count: imageCount };
  }

  logOutfitCritic({
    available: true,
    assessment: result.overall_assessment,
    style_match: result.style_match,
    color_harmony: result.color_harmony,
    proportion: result.proportion,
    occasion_match: result.occasion_match,
    cohesion: result.cohesion,
    image_count: imageCount,
  });

  return {
    fashion_critic_available: true,
    fashion_critic: result,
    image_count: imageCount,
  };
}
