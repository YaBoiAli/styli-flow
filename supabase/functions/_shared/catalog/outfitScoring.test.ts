/**
 * Outfit-level scorer comparisons. Asserts relative quality, not exact points,
 * plus Phase 0 named scoreOutfit baselines (season pinned to fall).
 * Dump baselines: STYLI_DUMP_SCORE_BASELINE=1 npx tsx supabase/functions/_shared/catalog/outfitScoring.test.ts
 * Run: npm run test:outfit-score
 */
import { extractColorTokens, OUTFIT_SCORE_WEIGHTS, productStyleAffinity, scoreOutfit, UNCERTAIN_DIMENSION, type OutfitScore, type OutfitScoreItem, type OutfitScoringContext } from './outfitScoring.ts';
import { emptyVisualAttributes, type VisualAttributes } from './visualAttributes.ts';

declare const process: { env: Record<string, string | undefined>; exit(code?: number): void };

let failed = 0;
let passed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${message}`);
}

function item(partial: Partial<OutfitScoreItem> & Pick<OutfitScoreItem, 'category' | 'name'>): OutfitScoreItem {
  return {
    colors: [],
    style_tags: [],
    aesthetic_tags: [],
    occasion_tags: [],
    season_tags: [],
    ...partial,
  };
}

const blackTee = item({
  category: 'top',
  name: 'Black Cotton Tee',
  color: 'black',
  colors: ['black'],
  material: 'cotton',
  subcategory: 't-shirt',
  fit: 'regular',
  silhouette: 'regular',
  pattern: 'solid',
  formality: 'casual',
  style_tags: ['casual', 'streetwear'],
  aesthetic_tags: ['streetwear'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const blueJeans = item({
  category: 'bottom',
  name: 'Blue Straight Jeans',
  color: 'blue',
  colors: ['blue'],
  material: 'denim',
  subcategory: 'jeans',
  fit: 'regular',
  silhouette: 'straight',
  pattern: 'solid',
  formality: 'casual',
  style_tags: ['casual', 'streetwear'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const whiteSneakers = item({
  category: 'shoes',
  name: 'White Canvas Sneakers',
  color: 'white',
  colors: ['white'],
  material: 'canvas',
  subcategory: 'sneakers',
  fit: 'regular',
  silhouette: 'regular',
  formality: 'casual',
  style_tags: ['casual', 'streetwear'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const creamSweater = item({
  category: 'top',
  name: 'Cream Knit Sweater',
  color: 'cream',
  colors: ['cream'],
  material: 'wool',
  subcategory: 'sweater',
  fit: 'regular',
  silhouette: 'regular',
  formality: 'smart_casual',
  style_tags: ['old_money', 'quiet_luxury'],
  aesthetic_tags: ['old_money'],
  occasion_tags: ['work', 'date'],
  season_tags: ['fall', 'winter'],
});

const olivePants = item({
  category: 'bottom',
  name: 'Olive Straight Chinos',
  color: 'olive',
  colors: ['olive'],
  material: 'cotton',
  subcategory: 'pants',
  fit: 'regular',
  silhouette: 'straight',
  formality: 'smart_casual',
  style_tags: ['old_money', 'preppy'],
  occasion_tags: ['work'],
  season_tags: ['fall'],
});

const brownShoes = item({
  category: 'shoes',
  name: 'Brown Leather Derbies',
  color: 'brown',
  colors: ['brown'],
  material: 'leather',
  subcategory: 'loafers',
  formality: 'smart_casual',
  style_tags: ['old_money'],
  occasion_tags: ['work', 'date'],
  season_tags: ['all_season'],
});

const oversizedTee = item({
  category: 'top',
  name: 'Oversized Graphic Tee',
  color: 'black',
  colors: ['black'],
  subcategory: 't-shirt',
  fit: 'oversized',
  silhouette: 'oversized',
  pattern: 'graphic',
  formality: 'casual',
  style_tags: ['streetwear'],
  aesthetic_tags: ['streetwear'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const baggyPants = item({
  category: 'bottom',
  name: 'Baggy Black Cargo Pants',
  color: 'black',
  colors: ['black'],
  subcategory: 'pants',
  fit: 'loose',
  silhouette: 'baggy',
  formality: 'casual',
  style_tags: ['streetwear'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const runningShoes = item({
  category: 'shoes',
  name: 'Running Trainers',
  color: 'white',
  colors: ['white'],
  subcategory: 'sneakers',
  formality: 'athletic',
  style_tags: ['athleisure'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const straightPants = item({
  category: 'bottom',
  name: 'Straight Black Trousers',
  color: 'black',
  colors: ['black'],
  subcategory: 'pants',
  fit: 'regular',
  silhouette: 'straight',
  formality: 'casual',
  style_tags: ['streetwear', 'minimalist'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const formalTrousers = item({
  category: 'bottom',
  name: 'Formal Wool Trousers',
  color: 'charcoal',
  colors: ['charcoal'],
  material: 'wool',
  subcategory: 'pants',
  fit: 'slim',
  silhouette: 'straight',
  formality: 'formal',
  style_tags: ['formal', 'old_money'],
  occasion_tags: ['work', 'event'],
  season_tags: ['fall', 'winter'],
});

const dressLoafers = item({
  category: 'shoes',
  name: 'Black Leather Dress Loafers',
  color: 'black',
  colors: ['black'],
  material: 'leather',
  subcategory: 'loafers',
  formality: 'formal',
  style_tags: ['old_money', 'formal'],
  occasion_tags: ['work', 'event'],
  season_tags: ['all_season'],
});

const burgundyTop = item({
  category: 'top',
  name: 'Burgundy Crew Sweater',
  color: 'burgundy',
  colors: ['burgundy'],
  material: 'cotton',
  subcategory: 'sweater',
  fit: 'regular',
  formality: 'casual',
  style_tags: ['casual', 'minimalist'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const blackPants = item({
  category: 'bottom',
  name: 'Black Straight Pants',
  color: 'black',
  colors: ['black'],
  subcategory: 'pants',
  fit: 'regular',
  silhouette: 'straight',
  formality: 'casual',
  style_tags: ['casual', 'minimalist'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const neonOrangeTop = item({
  category: 'top',
  name: 'Bright Orange Neon Tee',
  color: 'bright orange',
  colors: ['bright orange', 'neon'],
  subcategory: 't-shirt',
  fit: 'regular',
  pattern: 'solid',
  formality: 'casual',
  style_tags: ['casual'],
});

const neonGreenPants = item({
  category: 'bottom',
  name: 'Neon Green Track Pants',
  color: 'neon green',
  colors: ['neon green'],
  subcategory: 'joggers',
  fit: 'relaxed',
  formality: 'athletic',
  style_tags: ['athleisure'],
});

const cobaltShoes = item({
  category: 'shoes',
  name: 'Cobalt Racing Sneakers',
  color: 'cobalt',
  colors: ['cobalt'],
  subcategory: 'sneakers',
  formality: 'athletic',
  style_tags: ['athleisure'],
});

const oxfordShirt = item({
  category: 'top',
  name: 'White Oxford Shirt',
  color: 'white',
  colors: ['white'],
  material: 'cotton',
  subcategory: 'shirt',
  fit: 'regular',
  silhouette: 'straight',
  formality: 'smart_casual',
  style_tags: ['old_money', 'preppy'],
  aesthetic_tags: ['classic'],
  occasion_tags: ['work'],
  season_tags: ['all_season'],
});

const chinos = item({
  category: 'bottom',
  name: 'Khaki Chinos',
  color: 'camel',
  colors: ['camel'],
  subcategory: 'pants',
  fit: 'regular',
  silhouette: 'straight',
  formality: 'smart_casual',
  style_tags: ['old_money', 'preppy'],
  occasion_tags: ['work'],
  season_tags: ['all_season'],
});

const classicEveryday = { style: 'Casual', occasion: 'Everyday' as const };
const streetEveryday = { style: 'Streetwear', occasion: 'Everyday' as const };
const oldMoneyWork = { style: 'Old Money', occasion: 'Work' as const };

const casualClassic = scoreOutfit([blackTee, blueJeans, whiteSneakers], classicEveryday);
const earthMedium = scoreOutfit([creamSweater, olivePants, brownShoes], {
  ...oldMoneyWork,
  skinTone: 'medium',
  colorPreference: 'complexion',
});
const stackedStreet = scoreOutfit([oversizedTee, baggyPants, runningShoes], streetEveryday);
const stackedOldMoney = scoreOutfit([oversizedTee, baggyPants, runningShoes], oldMoneyWork);
const balancedStreet = scoreOutfit([oversizedTee, straightPants, whiteSneakers], streetEveryday);
const clashMix = scoreOutfit([oversizedTee, formalTrousers, dressLoafers], streetEveryday);
const burgundyAccent = scoreOutfit([burgundyTop, blackPants, whiteSneakers], classicEveryday);
const neonClash = scoreOutfit([neonOrangeTop, neonGreenPants, cobaltShoes], {
  style: 'Minimalist',
  occasion: 'Everyday',
});
const oldMoneyClassic = scoreOutfit([oxfordShirt, chinos, dressLoafers], oldMoneyWork);

console.log(
  JSON.stringify(
    {
      casualClassic: casualClassic.score,
      earthMedium: earthMedium.score,
      stackedStreet: stackedStreet.score,
      stackedOldMoney: stackedOldMoney.score,
      balancedStreet: balancedStreet.score,
      clashMix: clashMix.score,
      burgundyAccent: burgundyAccent.score,
      neonClash: neonClash.score,
      oldMoneyClassic: oldMoneyClassic.score,
    },
    null,
    2,
  ),
);

assert(casualClassic.score > neonClash.score, 'black/white/blue casual should beat neon clash');
assert(casualClassic.breakdown.color > neonClash.breakdown.color, 'neutral palette should beat three saturated hues');
assert(burgundyAccent.breakdown.color >= 80, 'burgundy + black + white is a strong accent palette');
assert(earthMedium.score > clashMix.score, 'cream/olive/brown old money should beat graphic+wool+loafers street mix');
assert(oldMoneyClassic.score > clashMix.score, 'shirt/chinos/loafers should beat mismatched street/formal mix');
assert(stackedStreet.score > stackedOldMoney.score, 'oversized+baggy is more acceptable for streetwear than old money');
assert(balancedStreet.breakdown.proportion >= stackedOldMoney.breakdown.proportion, 'oversized+straight should not lose to oversized+baggy on a tailored vibe');
assert(clashMix.breakdown.cohesion < oldMoneyClassic.breakdown.cohesion, 'graphic tee + formal trousers + loafers is less cohesive');
assert(clashMix.issues.length > 0, 'mismatched outfit should surface issues');
assert(casualClassic.score >= 70, 'classic casual outfit should be solid');
assert(oldMoneyClassic.score >= 70, 'classic old-money outfit should be solid');

const earthTan = scoreOutfit([creamSweater, olivePants, brownShoes], {
  ...oldMoneyWork,
  skinTone: 'tan',
  colorPreference: 'complexion',
});
assert(
  earthMedium.breakdown.skinTone >= earthTan.breakdown.skinTone,
  'medium skin should read cream/olive/brown at least as well as tan (brown is avoided on tan)',
);

const noMeasurements = scoreOutfit([blackTee, blueJeans, whiteSneakers], classicEveryday);
const withMeasurements = scoreOutfit([blackTee, blueJeans, whiteSneakers], {
  ...classicEveryday,
  measurements: { height_cm: 178, weight_kg: 75 },
});
assert(noMeasurements.breakdown.fit === 70, 'missing measurements stay neutral (70)');
assert(withMeasurements.breakdown.fit >= 66, 'height+weight only stays conservative');

const shortStacked = scoreOutfit([oversizedTee, baggyPants, runningShoes], {
  ...streetEveryday,
  measurements: { height_cm: 155, inseam_cm: 68 },
});
assert(
  shortStacked.breakdown.fit <= stackedStreet.breakdown.fit,
  'short frame + stacked volume should not raise the fit score',
);

const noSkin = scoreOutfit([blackTee, blueJeans, whiteSneakers], classicEveryday);
assert(noSkin.breakdown.skinTone === 70, 'missing skin tone stays neutral');

const orangeTokens = extractColorTokens(neonOrangeTop).map((token) => token.family);
const greenTokens = extractColorTokens(neonGreenPants).map((token) => token.family);
const blueTokens = extractColorTokens(cobaltShoes).map((token) => token.family);
assert(orangeTokens.includes('orange'), 'classifies bright orange');
assert(greenTokens.includes('green'), 'classifies neon green');
assert(blueTokens.includes('blue'), 'classifies cobalt as blue');

assert(casualClassic.issues.length === 0, 'strong casual outfit should not invent issues');
assert(scoreOutfit([], classicEveryday).score === 0, 'empty outfit scores 0');

const noShoesLook = scoreOutfit([blackTee, blueJeans], {
  ...classicEveryday,
  footwearPreference: 'none',
});
assert(noShoesLook.score > 0, 'no-shoes top+bottom still scores');
assert(
  noShoesLook.issues.every((issue) => !/missing shoes|no shoes|incomplete/i.test(issue)),
  'no-shoes scoring does not flag missing footwear',
);
assert(noShoesLook.breakdown.proportion > 0, 'proportion works on top+bottom');

function withVisual(
  base: OutfitScoreItem,
  visual: Partial<VisualAttributes> & { confidence?: number },
): OutfitScoreItem {
  return {
    ...base,
    visual_attributes: {
      ...emptyVisualAttributes(visual.confidence ?? 0.85),
      ...visual,
      confidence: visual.confidence ?? 0.85,
    },
  };
}

const dustyBlueTop = withVisual(blackTee, {
  primary_color: 'dusty blue',
  color_family: 'blue',
  saturation: 'low',
  brightness: 'medium',
  fit: 'regular',
  pattern: 'solid',
  visual_weight: 'light',
  visual_intensity: 2,
});
const electricBlueTop = withVisual(blackTee, {
  primary_color: 'electric blue',
  color_family: 'blue',
  saturation: 'high',
  brightness: 'light',
  pattern: 'solid',
  visual_intensity: 8,
});
const creamBottom = withVisual(blueJeans, {
  primary_color: 'cream',
  color_family: 'cream',
  saturation: 'low',
  brightness: 'light',
  pattern: 'solid',
  visual_weight: 'medium',
  visual_intensity: 2,
});
const whiteKicks = withVisual(whiteSneakers, {
  primary_color: 'white',
  color_family: 'white',
  saturation: 'low',
  brightness: 'light',
  pattern: 'solid',
  visual_intensity: 1,
});

const dustyLook = scoreOutfit([dustyBlueTop, creamBottom, whiteKicks], classicEveryday);
const electricLook = scoreOutfit([electricBlueTop, creamBottom, whiteKicks], classicEveryday);
assert(
  dustyLook.breakdown.color >= electricLook.breakdown.color,
  '10: muted blue should not be treated like electric blue',
);

const darkNavyTop = withVisual(blackTee, {
  primary_color: 'navy',
  color_family: 'navy',
  saturation: 'low',
  brightness: 'dark',
  pattern: 'solid',
});
const lightIvoryBottom = withVisual(blueJeans, {
  primary_color: 'ivory',
  color_family: 'cream',
  saturation: 'low',
  brightness: 'light',
  pattern: 'solid',
});
const brightnessMix = scoreOutfit([darkNavyTop, lightIvoryBottom, whiteKicks], classicEveryday);
assert(brightnessMix.breakdown.color >= 80, '11: dark + light neutrals stay harmonious');

const analogousLook = scoreOutfit(
  [
    withVisual(burgundyTop, { primary_color: 'burgundy', color_family: 'red', saturation: 'low', brightness: 'dark' }),
    withVisual(blackPants, { primary_color: 'black', color_family: 'black', saturation: 'low', brightness: 'dark' }),
    whiteKicks,
  ],
  classicEveryday,
);
assert(analogousLook.breakdown.color >= 80, '7: analogous/neutral accent palette stays high');

const complementaryLook = scoreOutfit(
  [
    withVisual(blackTee, { primary_color: 'navy', color_family: 'blue', saturation: 'medium', brightness: 'dark' }),
    withVisual(olivePants, { primary_color: 'olive', color_family: 'green', saturation: 'low', brightness: 'medium' }),
    whiteKicks,
  ],
  classicEveryday,
);
assert(complementaryLook.breakdown.color >= 70, '8: neighboring hues are not a clash');

const competingVisual = scoreOutfit(
  [
    withVisual(neonOrangeTop, {
      primary_color: 'neon orange',
      color_family: 'orange',
      saturation: 'high',
      brightness: 'light',
      visual_intensity: 9,
    }),
    withVisual(neonGreenPants, {
      primary_color: 'neon green',
      color_family: 'green',
      saturation: 'high',
      brightness: 'light',
      visual_intensity: 9,
    }),
    withVisual(cobaltShoes, {
      primary_color: 'cobalt',
      color_family: 'blue',
      saturation: 'high',
      brightness: 'medium',
      visual_intensity: 7,
    }),
  ],
  { style: 'Minimalist', occasion: 'Everyday' },
);
assert(competingVisual.breakdown.color < dustyLook.breakdown.color, '9: competing saturated colors score lower');

const fairNavyTop = scoreOutfit(
  [darkNavyTop, creamBottom, whiteKicks],
  { ...classicEveryday, skinTone: 'fair', colorPreference: 'complexion' },
);
const fairPeachTop = scoreOutfit(
  [
    withVisual(blackTee, {
      primary_color: 'peach',
      color_family: 'orange',
      saturation: 'medium',
      brightness: 'light',
    }),
    creamBottom,
    whiteKicks,
  ],
  { ...classicEveryday, skinTone: 'fair', colorPreference: 'complexion' },
);
assert(
  fairNavyTop.breakdown.skinTone > fairPeachTop.breakdown.skinTone,
  '12: skin-tone lists still distinguish flattering vs avoided colors',
);

const peachShoes = withVisual(whiteSneakers, {
  primary_color: 'peach',
  color_family: 'orange',
  saturation: 'medium',
  brightness: 'light',
});
const navyTopPeachShoes = scoreOutfit(
  [darkNavyTop, creamBottom, peachShoes],
  { ...classicEveryday, skinTone: 'fair', colorPreference: 'complexion' },
);
const peachTopWhiteShoes = scoreOutfit(
  [
    withVisual(blackTee, {
      primary_color: 'peach',
      color_family: 'orange',
      saturation: 'medium',
      brightness: 'light',
    }),
    creamBottom,
    whiteKicks,
  ],
  { ...classicEveryday, skinTone: 'fair', colorPreference: 'complexion' },
);
assert(
  navyTopPeachShoes.breakdown.skinTone > peachTopWhiteShoes.breakdown.skinTone,
  '13: top color influences skin-tone more than shoes',
);

const heavyOversized = withVisual(oversizedTee, { fit: 'oversized', visual_weight: 'heavy', silhouette: 'boxy' });
const heavyBaggy = withVisual(baggyPants, { fit: 'baggy', silhouette: 'wide', visual_weight: 'heavy' });
const stackedVisual = scoreOutfit([heavyOversized, heavyBaggy, runningShoes], streetEveryday);
const stackedVisualTailored = scoreOutfit([heavyOversized, heavyBaggy, runningShoes], oldMoneyWork);
assert(stackedVisual.breakdown.proportion > stackedVisualTailored.breakdown.proportion, '14: oversized + baggy still style-dependent');

const straightVisual = withVisual(straightPants, { fit: 'regular', silhouette: 'straight', visual_weight: 'medium' });
assert(
  scoreOutfit([heavyOversized, straightVisual, whiteSneakers], streetEveryday).breakdown.proportion >=
    stackedVisualTailored.breakdown.proportion,
  '15: oversized + straight is more balanced than two heavies on a tailored vibe',
);

const fittedTop = withVisual(blackTee, { fit: 'fitted', silhouette: 'fitted', visual_weight: 'light' });
const wideBottom = withVisual(blueJeans, { fit: 'relaxed', silhouette: 'wide', visual_weight: 'heavy' });
assert(
  scoreOutfit([fittedTop, wideBottom, whiteSneakers], classicEveryday).breakdown.proportion >= 80,
  '16: fitted + wide-leg is balanced',
);

const croppedTop = withVisual(blackTee, { length: 'cropped', silhouette: 'cropped', visual_weight: 'light' });
assert(
  scoreOutfit([croppedTop, wideBottom, whiteSneakers], classicEveryday).breakdown.proportion >=
    scoreOutfit([fittedTop, baggyPants, whiteSneakers], classicEveryday).breakdown.proportion,
  '17: cropped + high-volume bottom is acceptable',
);

const lightTee = withVisual(blackTee, { visual_weight: 'light', fit: 'fitted' });
const heavyBottom = withVisual(baggyPants, { visual_weight: 'heavy', silhouette: 'wide' });
assert(
  scoreOutfit([lightTee, heavyBottom, whiteSneakers], streetEveryday).breakdown.proportion >
    scoreOutfit([heavyOversized, heavyBaggy, runningShoes], oldMoneyWork).breakdown.proportion,
  '18: visual weight can balance a look',
);

const solidGraphic = scoreOutfit(
  [
    withVisual(blackTee, { pattern: 'solid', pattern_intensity: 'low', visual_intensity: 2 }),
    withVisual(blueJeans, { pattern: 'graphic', pattern_scale: 'medium', pattern_intensity: 'medium', visual_intensity: 5 }),
    whiteKicks,
  ],
  streetEveryday,
);
const doubleGraphic = scoreOutfit(
  [
    withVisual(oversizedTee, { pattern: 'graphic', pattern_scale: 'large', pattern_intensity: 'high', visual_intensity: 8 }),
    withVisual(blueJeans, { pattern: 'graphic', pattern_scale: 'large', pattern_intensity: 'high', visual_intensity: 8 }),
    whiteKicks,
  ],
  classicEveryday,
);
assert(solidGraphic.breakdown.cohesion > doubleGraphic.breakdown.cohesion, '19/20: solid + graphic beats graphic + graphic');

const mixedScale = scoreOutfit(
  [
    withVisual(oversizedTee, { pattern: 'graphic', pattern_scale: 'large', pattern_intensity: 'medium', visual_intensity: 6 }),
    withVisual(blueJeans, { pattern: 'stripe', pattern_scale: 'small', pattern_intensity: 'low', visual_intensity: 3 }),
    whiteKicks,
  ],
  classicEveryday,
);
assert(mixedScale.breakdown.cohesion > doubleGraphic.breakdown.cohesion, '21: large + small is milder than two large graphics');

const multiHigh = scoreOutfit(
  [
    withVisual(oversizedTee, { pattern: 'graphic', pattern_scale: 'large', pattern_intensity: 'high', visual_intensity: 9 }),
    withVisual(blueJeans, { pattern: 'plaid', pattern_scale: 'large', pattern_intensity: 'high', visual_intensity: 8 }),
    whiteKicks,
  ],
  { style: 'Minimalist', occasion: 'Everyday' },
);
assert(multiHigh.breakdown.cohesion <= mixedScale.breakdown.cohesion, '22: multiple high-intensity patterns are weaker');

const metadataOnly = scoreOutfit([blackTee, blueJeans, whiteSneakers], classicEveryday);
assert(metadataOnly.breakdown.color > 0 && metadataOnly.score > 0, '24: missing visual falls back to metadata');

const loudButUncertain = scoreOutfit(
  [
    withVisual(oversizedTee, {
      confidence: 0.2,
      pattern: 'graphic',
      pattern_scale: 'large',
      pattern_intensity: 'high',
      visual_intensity: 10,
      saturation: 'high',
    }),
    withVisual(blueJeans, {
      confidence: 0.1,
      pattern: 'graphic',
      pattern_scale: 'large',
      pattern_intensity: 'high',
      visual_intensity: 10,
    }),
    whiteSneakers,
  ],
  classicEveryday,
);
const catalogGraphics = scoreOutfit(
  [
    { ...oversizedTee, pattern: 'graphic' },
    { ...blueJeans, pattern: 'solid' },
    whiteSneakers,
  ],
  classicEveryday,
);
assert(
  Math.abs(loudButUncertain.score - catalogGraphics.score) < 12,
  '25: low-confidence visual data does not dominate scoring',
);

const noShoesVisual = scoreOutfit([dustyBlueTop, creamBottom], {
  ...classicEveryday,
  footwearPreference: 'none',
});
assert(noShoesVisual.score > 0, '26: no-shoes generation remains valid without footwear');
assert(
  noShoesVisual.issues.every((issue) => !/missing shoes|no shoes|incomplete/i.test(issue)),
  '28: no-shoes critic/scoring does not complain about missing footwear',
);

const breakdownKeys = Object.keys(casualClassic.breakdown).sort().join(',');
assert(
  breakdownKeys === 'cohesion,color,fit,occasion,proportion,season,skinTone,style',
  '30: fashion_score still contains all existing dimensions',
);
assert(
  OUTFIT_SCORE_WEIGHTS.style === 0.2 &&
    OUTFIT_SCORE_WEIGHTS.color === 0.2 &&
    OUTFIT_SCORE_WEIGHTS.proportion === 0.2 &&
    OUTFIT_SCORE_WEIGHTS.skinTone === 0.1 &&
    OUTFIT_SCORE_WEIGHTS.occasion === 0.1 &&
    OUTFIT_SCORE_WEIGHTS.fit === 0.05 &&
    OUTFIT_SCORE_WEIGHTS.season === 0.05 &&
    OUTFIT_SCORE_WEIGHTS.cohesion === 0.1,
  '30b: cohesion carries more of the outfit-quality signal than unused fit',
);

const styleFirstNavy = scoreOutfit(
  [darkNavyTop, creamBottom, whiteKicks],
  { ...classicEveryday, skinTone: 'fair' },
);
const complexionNavy = scoreOutfit(
  [darkNavyTop, creamBottom, whiteKicks],
  { ...classicEveryday, skinTone: 'fair', colorPreference: 'complexion' },
);
assert(styleFirstNavy.breakdown.skinTone === 70, 'style_first does not apply complexion scoring');
assert(
  complexionNavy.breakdown.skinTone !== 70 || complexionNavy.breakdown.skinTone === fairNavyTop.breakdown.skinTone,
  'complexion preference enables complexion scoring',
);
assert(
  complexionNavy.breakdown.skinTone > styleFirstNavy.breakdown.skinTone,
  'complexion preference actually changes the skinTone dimension',
);

const noVisualColor = item({ category: 'top', name: 'Unlabeled Top' });
const missingColorLook = scoreOutfit(
  [noVisualColor, blueJeans, whiteSneakers],
  { ...classicEveryday, skinTone: 'fair', colorPreference: 'complexion' },
);
assert(missingColorLook.breakdown.skinTone > 0, 'missing visual color is handled safely');

const randomUntagged = scoreOutfit(
  [
    item({ category: 'top', name: 'Generic Shirt', color: 'red' }),
    item({ category: 'bottom', name: 'Generic Pants', color: 'green' }),
    item({ category: 'shoes', name: 'Generic Shoes', color: 'blue' }),
  ],
  streetEveryday,
);
assert(
  casualClassic.score > randomUntagged.score,
  'cohesive outfit beats technically valid but unstyled random combo',
);

const unknownStyle = productStyleAffinity(
  item({ category: 'top', name: 'Article 7' }),
  'Streetwear',
);
assert(unknownStyle === UNCERTAIN_DIMENSION, '6: missing style metadata is uncertain, not positive');
assert(unknownStyle < 70, '6b: unknown style is not treated as a good match');
assert(
  productStyleAffinity(blackTee, 'Streetwear') > unknownStyle,
  '7: existing style tags remain positive evidence',
);
assert(
  clashMix.score < oldMoneyClassic.score,
  'technically valid but incohesive outfit scores lower than a cohesive one',
);
assert(
  clashMix.breakdown.style < oldMoneyClassic.breakdown.style,
  'style compatibility matters for the complete outfit',
);
assert(
  clashMix.breakdown.proportion <= balancedStreet.breakdown.proportion,
  'silhouette/proportion matters',
);

const clashWithComplexion = scoreOutfit([oversizedTee, formalTrousers, dressLoafers], {
  ...streetEveryday,
  skinTone: 'medium',
  colorPreference: 'complexion',
});
const classicWithComplexion = scoreOutfit([oxfordShirt, chinos, dressLoafers], {
  ...oldMoneyWork,
  skinTone: 'medium',
  colorPreference: 'complexion',
});
assert(
  classicWithComplexion.score > clashWithComplexion.score,
  'complexion compatibility does not dominate other styling factors',
);
assert(
  fairNavyTop.breakdown.skinTone > fairPeachTop.breakdown.skinTone,
  'complexion compatibility matters when enabled',
);

type ScoreBaselineSnapshot = {
  score: number;
  style: number;
  color: number;
  proportion: number;
  skinTone: number;
  occasion: number;
  fit: number;
  season: number;
  cohesion: number;
  issues: string[];
  suggestions: string[];
};

function visualLook(
  partial: Partial<VisualAttributes> & Pick<VisualAttributes, 'confidence'>,
): VisualAttributes {
  return {
    ...emptyVisualAttributes(partial.confidence),
    ...partial,
  };
}

function scoreSnapshot(result: OutfitScore): ScoreBaselineSnapshot {
  return {
    score: result.score,
    style: result.breakdown.style,
    color: result.breakdown.color,
    proportion: result.breakdown.proportion,
    skinTone: result.breakdown.skinTone,
    occasion: result.breakdown.occasion,
    fit: result.breakdown.fit,
    season: result.breakdown.season,
    cohesion: result.breakdown.cohesion,
    issues: [...result.issues],
    suggestions: [...result.suggestions],
  };
}

function formatScoreDump(name: string, snap: ScoreBaselineSnapshot): string {
  const list = (label: string, values: string[]) =>
    [`${label}:`, ...(values.length ? values.map((value) => `- ${value}`) : ['(none)'])].join('\n');
  return [
    `FIXTURE: ${name}`,
    '',
    `score: ${snap.score}`,
    `style: ${snap.style}`,
    `color: ${snap.color}`,
    `proportion: ${snap.proportion}`,
    `skinTone: ${snap.skinTone}`,
    `occasion: ${snap.occasion}`,
    `fit: ${snap.fit}`,
    `season: ${snap.season}`,
    `cohesion: ${snap.cohesion}`,
    '',
    list('issues', snap.issues),
    '',
    list('suggestions', snap.suggestions),
  ].join('\n');
}

function assertScoreBaseline(
  name: string,
  items: OutfitScoreItem[],
  context: OutfitScoringContext,
  expected: ScoreBaselineSnapshot,
): void {
  const result = scoreOutfit(items, {
    season: 'fall',
    colorPreference: 'style_first',
    ...context,
  });
  const snap = scoreSnapshot(result);
  if (process.env.STYLI_DUMP_SCORE_BASELINE === '1') {
    console.log(formatScoreDump(name, snap));
    console.log('');
  }
  const same = JSON.stringify(snap) === JSON.stringify(expected);
  if (!same) {
    console.error(`FAIL: scoring baseline ${name}`);
    console.error('--- current ---');
    console.error(formatScoreDump(name, snap));
    console.error('--- baseline ---');
    console.error(formatScoreDump(name, expected));
  }
  assert(same, `scoring baseline ${name} matches frozen scoreOutfit output`);
}

const zipHoodie = item({
  category: 'top',
  name: 'Black Zip Hoodie',
  color: 'black',
  colors: ['black'],
  material: 'cotton',
  subcategory: 'hoodie',
  fit: 'oversized',
  silhouette: 'oversized',
  pattern: 'solid',
  formality: 'casual',
  style_tags: ['streetwear'],
  aesthetic_tags: ['streetwear'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const baggyJeans = item({
  category: 'bottom',
  name: 'Baggy Denim Jeans',
  color: 'blue',
  colors: ['blue'],
  material: 'denim',
  subcategory: 'jeans',
  fit: 'loose',
  silhouette: 'baggy',
  pattern: 'solid',
  formality: 'casual',
  style_tags: ['streetwear'],
  occasion_tags: ['everyday', 'school'],
  season_tags: ['all_season'],
});

const skateSneakers = item({
  category: 'shoes',
  name: 'Skate Sneakers',
  color: 'black',
  colors: ['black'],
  material: 'canvas',
  subcategory: 'sneakers',
  fit: 'regular',
  silhouette: 'regular',
  formality: 'casual',
  style_tags: ['streetwear'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const rhinestoneBabyTee = item({
  category: 'top',
  name: 'Rhinestone Metallic Baby Tee',
  color: 'silver',
  colors: ['silver', 'metallic'],
  material: 'polyester',
  subcategory: 't-shirt',
  fit: 'fitted',
  silhouette: 'cropped',
  pattern: 'graphic',
  formality: 'casual',
  style_tags: ['y2k'],
  aesthetic_tags: ['y2k'],
  occasion_tags: ['party', 'night out'],
  season_tags: ['all_season'],
  visual_attributes: visualLook({
    confidence: 0.88,
    primary_color: 'silver',
    color_family: 'silver',
    saturation: 'high',
    fit: 'fitted',
    silhouette: 'cropped',
    pattern: 'graphic',
    visual_intensity: 8,
    material_appearance: 'silky',
    aesthetics: ['y2k'],
  }),
});

const lowRiseFlareJeans = item({
  category: 'bottom',
  name: 'Low Rise Flare Jeans',
  color: 'blue',
  colors: ['blue'],
  material: 'denim',
  subcategory: 'jeans',
  fit: 'slim',
  silhouette: 'low_rise',
  pattern: 'solid',
  formality: 'casual',
  style_tags: ['y2k'],
  aesthetic_tags: ['y2k'],
  occasion_tags: ['party'],
  season_tags: ['all_season'],
  visual_attributes: visualLook({
    confidence: 0.84,
    primary_color: 'blue',
    color_family: 'blue',
    fit: 'slim',
    silhouette: 'wide',
    aesthetics: ['y2k'],
  }),
});

const platformSneakers = item({
  category: 'shoes',
  name: 'Chunky Platform Sneakers',
  color: 'white',
  colors: ['white'],
  material: 'leather',
  subcategory: 'sneakers',
  fit: 'regular',
  silhouette: 'platform',
  formality: 'casual',
  style_tags: ['y2k'],
  aesthetic_tags: ['y2k'],
  occasion_tags: ['party'],
  season_tags: ['all_season'],
  visual_attributes: visualLook({
    confidence: 0.8,
    primary_color: 'white',
    color_family: 'white',
    silhouette: 'structured',
    aesthetics: ['y2k'],
  }),
});

const greyHoodie = item({
  category: 'top',
  name: 'Grey Oversized Hoodie',
  color: 'grey',
  colors: ['grey'],
  material: 'cotton',
  subcategory: 'hoodie',
  fit: 'oversized',
  silhouette: 'oversized',
  formality: 'casual',
  style_tags: ['streetwear'],
  aesthetic_tags: ['streetwear'],
  occasion_tags: ['everyday', 'school'],
  season_tags: ['all_season'],
});

const cashmereCrew = item({
  category: 'top',
  name: 'Camel Cashmere Crew',
  color: 'camel',
  colors: ['camel'],
  material: 'cashmere',
  subcategory: 'sweater',
  fit: 'regular',
  silhouette: 'regular',
  formality: 'smart_casual',
  style_tags: ['quiet luxury', 'old money'],
  aesthetic_tags: ['quiet_luxury'],
  occasion_tags: ['everyday', 'work'],
  season_tags: ['fall', 'winter'],
});

const tailoredTrousers = item({
  category: 'bottom',
  name: 'Ivory Tailored Trousers',
  color: 'ivory',
  colors: ['ivory'],
  material: 'wool',
  subcategory: 'trousers',
  fit: 'slim',
  silhouette: 'straight',
  formality: 'smart_casual',
  style_tags: ['quiet luxury'],
  aesthetic_tags: ['quiet_luxury'],
  occasion_tags: ['everyday', 'work'],
  season_tags: ['fall'],
});

const suedeLoafers = item({
  category: 'shoes',
  name: 'Tan Suede Loafers',
  color: 'tan',
  colors: ['tan'],
  material: 'suede',
  subcategory: 'loafers',
  formality: 'smart_casual',
  style_tags: ['quiet luxury', 'old money'],
  occasion_tags: ['everyday', 'work'],
  season_tags: ['all_season'],
});

const whiteDressShirt = item({
  category: 'top',
  name: 'White Dress Shirt',
  color: 'white',
  colors: ['white'],
  material: 'cotton',
  subcategory: 'shirt',
  fit: 'slim',
  silhouette: 'regular',
  formality: 'formal',
  style_tags: ['formal'],
  aesthetic_tags: ['formal'],
  occasion_tags: ['event', 'work'],
  season_tags: ['all_season'],
});

const charcoalSuitPants = item({
  category: 'bottom',
  name: 'Charcoal Suit Trousers',
  color: 'charcoal',
  colors: ['charcoal'],
  material: 'wool',
  subcategory: 'trousers',
  fit: 'slim',
  silhouette: 'straight',
  formality: 'formal',
  style_tags: ['formal'],
  occasion_tags: ['event', 'work'],
  season_tags: ['fall', 'winter'],
});

const blackOxfords = item({
  category: 'shoes',
  name: 'Black Leather Oxfords',
  color: 'black',
  colors: ['black'],
  material: 'leather',
  subcategory: 'oxfords',
  formality: 'formal',
  style_tags: ['formal'],
  occasion_tags: ['event'],
  season_tags: ['all_season'],
});

const navyKnit = item({
  category: 'top',
  name: 'Navy Fine Knit',
  color: 'navy',
  colors: ['navy'],
  material: 'merino',
  subcategory: 'sweater',
  fit: 'regular',
  silhouette: 'regular',
  formality: 'casual',
  style_tags: ['minimalist'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const stoneTrousers = item({
  category: 'bottom',
  name: 'Stone Straight Trousers',
  color: 'stone',
  colors: ['stone'],
  material: 'cotton',
  subcategory: 'trousers',
  fit: 'regular',
  silhouette: 'straight',
  formality: 'casual',
  style_tags: ['minimalist'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const rebuildHoodie = item({
  category: 'top',
  name: 'Charcoal Zip Hoodie',
  color: 'charcoal',
  colors: ['charcoal'],
  material: 'cotton',
  subcategory: 'hoodie',
  fit: 'oversized',
  silhouette: 'oversized',
  formality: 'casual',
  style_tags: ['streetwear'],
  aesthetic_tags: ['streetwear'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const rebuildJeans = item({
  category: 'bottom',
  name: 'Washed Baggy Jeans',
  color: 'blue',
  colors: ['blue'],
  material: 'denim',
  subcategory: 'jeans',
  fit: 'loose',
  silhouette: 'baggy',
  formality: 'casual',
  style_tags: ['streetwear'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const rebuildSneakers = item({
  category: 'shoes',
  name: 'White Skate Sneakers',
  color: 'white',
  colors: ['white'],
  subcategory: 'sneakers',
  formality: 'casual',
  style_tags: ['streetwear'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});

const y2kParty = { style: 'Y2K', occasion: 'Party' } as const;
const streetWork = { style: 'Streetwear', occasion: 'Work' } as const;
const quietEveryday = { style: 'Quiet Luxury', occasion: 'Everyday' } as const;
const formalEvent = { style: 'Formal', occasion: 'Event' } as const;
const streetEverydayCtx = { style: 'Streetwear', occasion: 'Everyday' } as const;

assertScoreBaseline(
  'generic-y2k-party',
  [zipHoodie, baggyJeans, skateSneakers],
  y2kParty,
  {
    score: 72,
    style: 38,
    color: 92,
    proportion: 84,
    skinTone: 70,
    occasion: 68,
    fit: 70,
    season: 92,
    cohesion: 74,
    issues: [
      'The outfit has weak visual connection to the requested style.',
      'Outfit does not show the requested occasion.',
    ],
    suggestions: [
      'Lean on pieces whose tags or cuts match the requested vibe.',
      'Add a piece that reads as the requested occasion, not only a matching formality.',
    ],
  },
);
assertScoreBaseline(
  'visible-y2k-party',
  [rhinestoneBabyTee, lowRiseFlareJeans, platformSneakers],
  y2kParty,
  {
    score: 83,
    style: 90,
    color: 92,
    proportion: 68,
    skinTone: 70,
    occasion: 94,
    fit: 70,
    season: 92,
    cohesion: 88,
    issues: [],
    suggestions: [],
  },
);
assertScoreBaseline(
  'generic-streetwear-work',
  [greyHoodie, baggyJeans, skateSneakers],
  streetWork,
  {
    score: 80,
    style: 90,
    color: 92,
    proportion: 84,
    skinTone: 70,
    occasion: 42,
    fit: 70,
    season: 92,
    cohesion: 74,
    issues: [
      'Outfit formality does not match the requested occasion.',
      'Outfit does not show the requested occasion.',
    ],
    suggestions: [
      'Choose pieces whose formality matches the occasion.',
      'Add a piece that reads as the requested occasion, not only a matching formality.',
    ],
  },
);
assertScoreBaseline(
  'quiet-luxury-everyday',
  [cashmereCrew, tailoredTrousers, suedeLoafers],
  quietEveryday,
  {
    score: 87,
    style: 90,
    color: 94,
    proportion: 84,
    skinTone: 70,
    occasion: 94,
    fit: 70,
    season: 92,
    cohesion: 90,
    issues: [],
    suggestions: [],
  },
);
assertScoreBaseline(
  'formal-event',
  [whiteDressShirt, charcoalSuitPants, blackOxfords],
  formalEvent,
  {
    score: 86,
    style: 90,
    color: 94,
    proportion: 84,
    skinTone: 70,
    occasion: 98,
    fit: 70,
    season: 92,
    cohesion: 80,
    issues: [],
    suggestions: [],
  },
);
assertScoreBaseline(
  'no-shoes-minimalist-everyday',
  [navyKnit, stoneTrousers],
  { style: 'Minimalist', occasion: 'Everyday', footwearPreference: 'none' },
  {
    score: 81,
    style: 78,
    color: 94,
    proportion: 84,
    skinTone: 70,
    occasion: 86,
    fit: 70,
    season: 86,
    cohesion: 64,
    issues: [],
    suggestions: [],
  },
);
assertScoreBaseline(
  'rebuild-previous-streetwear-everyday',
  [zipHoodie, baggyJeans, skateSneakers],
  streetEverydayCtx,
  {
    score: 86,
    style: 90,
    color: 92,
    proportion: 84,
    skinTone: 70,
    occasion: 94,
    fit: 70,
    season: 92,
    cohesion: 80,
    issues: [],
    suggestions: [],
  },
);
assertScoreBaseline(
  'rebuild-candidate-streetwear-everyday',
  [rebuildHoodie, rebuildJeans, rebuildSneakers],
  streetEverydayCtx,
  {
    score: 86,
    style: 90,
    color: 92,
    proportion: 84,
    skinTone: 70,
    occasion: 94,
    fit: 70,
    season: 92,
    cohesion: 80,
    issues: [],
    suggestions: [],
  },
);

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);
