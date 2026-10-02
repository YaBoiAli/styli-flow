/**
 * Phase 5B: bounded visual adjustment for candidate shortlisting.
 * Not an outfit score. Missing/low-confidence visual data scores 0, never a large penalty.
 */
import { attrKey, type FormalityAttr } from '../_shared/catalog/fashionAttributes.ts';
import {
  occasionContractFor,
  styleContractFor,
} from '../_shared/catalog/styleOccasionContract.ts';
import {
  visualIsUsable,
  type VisualAttributes,
} from '../_shared/catalog/visualAttributes.ts';
import type { CatalogProduct } from './catalog.ts';

/** Modest cap so visual evidence cannot dominate text relevance. */
export const VISUAL_ADJUSTMENT_MAX = 2.5;

const VOLUME_FITS = new Set(['oversized', 'baggy', 'loose', 'relaxed']);
const NARROW_FITS = new Set(['fitted', 'slim']);
const VOLUME_SILHOUETTES = new Set(['oversized', 'baggy', 'wide', 'wide_leg', 'boxy']);
const NARROW_SILHOUETTES = new Set(['fitted', 'straight', 'structured', 'slim']);

export type VisualRankingProduct = Pick<CatalogProduct, 'category' | 'visual_attributes'>;

function clampAdjustment(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(VISUAL_ADJUSTMENT_MAX, value);
}

function usableVisual(product: VisualRankingProduct): VisualAttributes | null {
  if (!visualIsUsable(product) || !product.visual_attributes) return null;
  return product.visual_attributes;
}

function usesFit(category: string): boolean {
  return category === 'top' || category === 'bottom' || category === 'outerwear';
}

function usesSilhouette(category: string): boolean {
  return (
    category === 'top' ||
    category === 'bottom' ||
    category === 'shoes' ||
    category === 'outerwear'
  );
}

function usesIntensity(category: string): boolean {
  return category === 'top' || category === 'outerwear' || category === 'accessory';
}

function usesWeight(category: string): boolean {
  return category === 'bottom' || category === 'shoes' || category === 'outerwear';
}

function fitCompatible(visualFit: string, priors: string[]): boolean {
  const visual = attrKey(visualFit);
  const aliases =
    visual === 'baggy'
      ? ['baggy', 'oversized', 'loose', 'relaxed']
      : visual === 'oversized'
        ? ['oversized', 'baggy', 'loose']
        : visual === 'loose'
          ? ['loose', 'relaxed', 'oversized']
          : visual === 'relaxed'
            ? ['relaxed', 'loose']
            : [visual];
  return priors.some((prior) => aliases.includes(attrKey(prior)));
}

function silhouetteCompatible(visualSilhouette: string, priors: string[]): boolean {
  const mapped = visualSilhouette === 'wide' ? 'wide_leg' : visualSilhouette;
  const keys = new Set([attrKey(visualSilhouette), attrKey(mapped)]);
  return priors.some((prior) => keys.has(attrKey(prior)));
}

function formalityBand(value: number): FormalityAttr {
  if (value < 0.34) return 'casual';
  if (value < 0.67) return 'smart_casual';
  return 'formal';
}

function formalityCompatible(value: number, accepted: FormalityAttr[]): boolean {
  const band = formalityBand(value);
  if (accepted.includes(band)) return true;
  return band === 'casual' && accepted.includes('athletic');
}

function volumeLook(visual: VisualAttributes): 'volume' | 'narrow' | null {
  const fit = visual.fit ? attrKey(visual.fit) : '';
  const silhouette = visual.silhouette ? attrKey(visual.silhouette) : '';
  const mappedSilhouette = silhouette === 'wide' ? 'wide_leg' : silhouette;
  if (
    visual.visual_weight === 'heavy' ||
    VOLUME_FITS.has(fit) ||
    VOLUME_SILHOUETTES.has(silhouette) ||
    VOLUME_SILHOUETTES.has(mappedSilhouette)
  ) {
    return 'volume';
  }
  if (
    visual.visual_weight === 'light' ||
    NARROW_FITS.has(fit) ||
    NARROW_SILHOUETTES.has(silhouette) ||
    NARROW_SILHOUETTES.has(mappedSilhouette)
  ) {
    return 'narrow';
  }
  return null;
}

function intensityLook(visual: VisualAttributes): 'high' | 'low' | null {
  if (
    (typeof visual.visual_intensity === 'number' && visual.visual_intensity >= 6) ||
    visual.pattern_intensity === 'high' ||
    visual.saturation === 'high'
  ) {
    return 'high';
  }
  if (
    (typeof visual.visual_intensity === 'number' && visual.visual_intensity <= 4) ||
    visual.pattern_intensity === 'low' ||
    visual.saturation === 'low' ||
    visual.pattern === 'solid'
  ) {
    return 'low';
  }
  return null;
}

/**
 * How useful reliable visual evidence is for this product in the requested style/occasion.
 * Returns 0 when visual data is missing or below the existing confidence threshold.
 */
export function scoreVisualCandidateRelevance(
  product: VisualRankingProduct,
  style: string,
  occasion: string,
): number {
  const visual = usableVisual(product);
  if (!visual) return 0;

  const styleContract = styleContractFor(style);
  const occasionContract = occasionContractFor(occasion);
  const category = product.category;
  let adjustment = 0;

  if (usesFit(category) && visual.fit && styleContract?.fitPriors.length) {
    if (fitCompatible(visual.fit, styleContract.fitPriors)) adjustment += 0.6;
  }
  if (usesSilhouette(category) && visual.silhouette && styleContract?.silhouettePriors.length) {
    if (silhouetteCompatible(visual.silhouette, styleContract.silhouettePriors)) adjustment += 0.6;
  }

  const volume = volumeLook(visual);
  if (styleContract && volume) {
    if (styleContract.volumeFriendly && volume === 'volume') adjustment += 0.5;
    if (!styleContract.volumeFriendly && volume === 'narrow') adjustment += 0.5;
  }

  if (usesIntensity(category) && styleContract) {
    const intensity = intensityLook(visual);
    if (intensity === 'high' && styleContract.intensityFriendly) adjustment += 0.4;
    if (intensity === 'low' && !styleContract.intensityFriendly) adjustment += 0.4;
  }

  if (
    typeof visual.formality === 'number' &&
    occasionContract?.acceptedFormality.length &&
    formalityCompatible(visual.formality, occasionContract.acceptedFormality)
  ) {
    adjustment += 0.4;
  }

  if (category === 'shoes' && occasionContract && typeof visual.formality === 'number') {
    if (occasionContract.classyFootwear && visual.formality >= 0.55) adjustment += 0.4;
    if (!occasionContract.classyFootwear && visual.formality < 0.45) adjustment += 0.4;
  }

  if (usesWeight(category) && visual.visual_weight && styleContract) {
    if (styleContract.volumeFriendly && visual.visual_weight === 'heavy') adjustment += 0.2;
    if (!styleContract.volumeFriendly && visual.visual_weight === 'light') adjustment += 0.2;
  }

  return clampAdjustment(adjustment);
}
