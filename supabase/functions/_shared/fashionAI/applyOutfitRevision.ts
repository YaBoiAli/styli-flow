import { candidatesShareTooManyProducts } from '../../generate-outfit/outfitDiversity.ts';
import type { OutfitScore } from '../catalog/outfitScoring.ts';
import { logPerf, perfNow } from '../perfLog.ts';
import type { CriticRunResult } from './critiqueWinningOutfit.ts';
import { countChangedItems, shouldAcceptRevision } from './revisionCompare.ts';
import { revisionNeededReason, shouldReviseCritic } from './shouldReviseCritic.ts';
import type {
  FashionAIProvider,
  FashionCriticInput,
  FashionCriticResult,
  FashionRevisionInput,
  FashionRevisionResult,
} from './types.ts';

export type RevisionAttachment = {
  fashion_revision_attempted: boolean;
  fashion_revision_accepted: boolean;
  fashion_revision_reason: string | null;
};

export type RevisionApplyResult<TBuilt, TProduct> = {
  built: TBuilt;
  outfitName: string;
  stylingTip: string;
  items: Array<{ product_id: string; reason: string }>;
  products: TProduct[];
  fashion: OutfitScore;
  critic: CriticRunResult;
  revision: RevisionAttachment;
  criticCalls: number;
};

export function logOutfitRevision(input: {
  attempted: boolean;
  accepted?: boolean;
  original_score?: number;
  revised_score?: number;
  changed_items?: number;
  reason?: string;
}): void {
  console.log(`[OUTFIT_REVISION] ${JSON.stringify(input)}`);
}

function toAiItems(
  revision: FashionRevisionResult,
  fallbackReason: string,
): Array<{ product_id: string; reason: string }> {
  return revision.items.map((item) => ({
    product_id: item.product_id,
    reason: item.reason?.trim() || fallbackReason,
  }));
}

/**
 * At most one revision attempt. Never throws.
 * Critic is advisory; scoreOutfit decides whether the fix is kept.
 */
export async function applyOutfitRevision<TBuilt, TProduct>(params: {
  critic: FashionCriticResult | null | undefined;
  originalCriticRun: CriticRunResult;
  original: {
    outfitName: string;
    stylingTip: string;
    items: Array<{ product_id: string; reason: string }>;
    built: TBuilt;
    products: TProduct[];
    fashion: OutfitScore;
  };
  revisionInput: FashionRevisionInput;
  provider: FashionAIProvider;
  validate: (outfit: {
    outfit_name: string;
    styling_tip: string;
    items: Array<{ product_id: string; reason: string }>;
  }) => TBuilt;
  productsOf: (built: TBuilt) => TProduct[];
  score: (products: TProduct[]) => OutfitScore;
  critique: (input: FashionCriticInput) => Promise<CriticRunResult>;
  criticInputFor: (products: TProduct[]) => FashionCriticInput;
  /** Rebuild only. Empty/omitted means first generation — no diversity compare. */
  previousOutfitItems?: Array<{ product_id: string }>;
}): Promise<RevisionApplyResult<TBuilt, TProduct>> {
  const keepOriginal = (
    reason: string,
    extras?: { revised_score?: number; changed_items?: number },
  ): RevisionApplyResult<TBuilt, TProduct> => {
    logOutfitRevision({
      attempted: true,
      accepted: false,
      original_score: params.original.fashion.score,
      ...extras,
      reason,
    });
    return {
      built: params.original.built,
      outfitName: params.original.outfitName,
      stylingTip: params.original.stylingTip,
      items: params.original.items,
      products: params.original.products,
      fashion: params.original.fashion,
      critic: params.originalCriticRun,
      revision: {
        fashion_revision_attempted: true,
        fashion_revision_accepted: false,
        fashion_revision_reason: reason,
      },
      criticCalls: 1,
    };
  };

  if (!shouldReviseCritic(params.critic)) {
    const reason = params.critic
      ? 'critic_did_not_identify_meaningful_issue'
      : 'critic_unavailable';
    logPerf('revision', 'SKIPPED');
    logPerf('revision_validation', 'SKIPPED');
    logOutfitRevision({ attempted: false, reason });
    return {
      built: params.original.built,
      outfitName: params.original.outfitName,
      stylingTip: params.original.stylingTip,
      items: params.original.items,
      products: params.original.products,
      fashion: params.original.fashion,
      critic: params.originalCriticRun,
      revision: {
        fashion_revision_attempted: false,
        fashion_revision_accepted: false,
        fashion_revision_reason: reason,
      },
      criticCalls: params.originalCriticRun.fashion_critic_available ? 1 : 0,
    };
  }

  const trigger = revisionNeededReason(params.critic) ?? 'critic_issue';
  let revision: FashionRevisionResult | null = null;
  const revisionStarted = perfNow();
  try {
    revision = await params.provider.reviseOutfit(params.revisionInput);
  } catch {
    logPerf('revision', perfNow() - revisionStarted);
    logPerf('revision_validation', 'SKIPPED');
    return keepOriginal('provider_error');
  }
  logPerf('revision', perfNow() - revisionStarted);
  if (!revision) {
    logPerf('revision_validation', 'SKIPPED');
    return keepOriginal('malformed_revision');
  }

  const items = toAiItems(revision, 'Revised to address critic feedback.');
  const outfit = {
    outfit_name: revision.outfit_name?.trim() || params.original.outfitName,
    styling_tip: revision.styling_tip?.trim() || params.original.stylingTip,
    items,
  };

  let built: TBuilt;
  const revisionValidationStarted = perfNow();
  try {
    built = params.validate(outfit);
  } catch (err) {
    logPerf('revision_validation', perfNow() - revisionValidationStarted);
    const reason = err instanceof Error ? err.message : 'validation_failed';
    return keepOriginal(
      reason === 'budget' || reason === 'gender_mismatch' ? reason : 'validation_failed',
    );
  }

  let products: TProduct[];
  let fashion: OutfitScore;
  try {
    products = params.productsOf(built);
    fashion = params.score(products);
  } catch {
    logPerf('revision_validation', perfNow() - revisionValidationStarted);
    return keepOriginal('scoring_error');
  }
  logPerf('revision_validation', perfNow() - revisionValidationStarted);

  const originalIds = params.original.items.map((item) => item.product_id);
  const revisedIds = items.map((item) => item.product_id);
  const changedItems = countChangedItems(originalIds, revisedIds);

  if (!shouldAcceptRevision(params.original.fashion, fashion)) {
    return keepOriginal('insufficient_improvement', {
      revised_score: fashion.score,
      changed_items: changedItems,
    });
  }

  const previousOutfitItems = (params.previousOutfitItems ?? []).filter((item) => item.product_id);
  if (
    previousOutfitItems.length &&
    candidatesShareTooManyProducts([{ items: previousOutfitItems }, { items }])
  ) {
    return keepOriginal('rebuild_diversity', {
      revised_score: fashion.score,
      changed_items: changedItems,
    });
  }

  let finalCritic = params.originalCriticRun;
  let criticCalls = 1;
  try {
    finalCritic = await params.critique(params.criticInputFor(products));
    criticCalls = 2;
  } catch {
    finalCritic = {
      fashion_critic_available: false,
      reason: 'provider_error',
      image_count: 0,
    };
    criticCalls = 2;
  }

  logOutfitRevision({
    attempted: true,
    accepted: true,
    original_score: params.original.fashion.score,
    revised_score: fashion.score,
    changed_items: changedItems,
    reason: trigger,
  });

  return {
    built,
    outfitName: outfit.outfit_name,
    stylingTip: outfit.styling_tip,
    items,
    products,
    fashion,
    critic: finalCritic,
    revision: {
      fashion_revision_attempted: true,
      fashion_revision_accepted: true,
      fashion_revision_reason: trigger,
    },
    criticCalls,
  };
}
