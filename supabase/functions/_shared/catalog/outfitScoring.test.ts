/**
 * Outfit-level scorer comparisons. Asserts relative quality, not exact points.
 * Run: npm run test:outfit-score
 */
import { extractColorTokens, scoreOutfit, type OutfitScoreItem } from './outfitScoring.ts';

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

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);
