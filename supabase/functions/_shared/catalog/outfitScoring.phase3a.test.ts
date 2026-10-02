/**
 * Phase 3A: honest contract-driven style/occasion scoring.
 * Offline only. Does not call Channel3.
 * Run: npm run test:outfit-score
 */
import { scoreOutfit, UNCERTAIN_DIMENSION, type OutfitScoreItem } from './outfitScoring.ts';

declare const process: { exit(code?: number): void };

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

const genericHoodie = item({
  category: 'top',
  name: 'Black Zip Hoodie',
  color: 'black',
  colors: ['black'],
  material: 'cotton',
  subcategory: 'hoodie',
  fit: 'oversized',
  silhouette: 'oversized',
  formality: 'casual',
  style_tags: ['streetwear'],
  occasion_tags: ['everyday'],
});
const genericJeans = item({
  category: 'bottom',
  name: 'Straight Blue Jeans',
  color: 'blue',
  colors: ['blue'],
  material: 'denim',
  subcategory: 'jeans',
  fit: 'regular',
  silhouette: 'straight',
  formality: 'casual',
  style_tags: ['casual'],
  occasion_tags: ['everyday'],
});
const genericSneakers = item({
  category: 'shoes',
  name: 'White Canvas Sneakers',
  color: 'white',
  colors: ['white'],
  subcategory: 'sneakers',
  formality: 'casual',
  style_tags: ['casual'],
  occasion_tags: ['everyday'],
});
const y2kTop = item({
  category: 'top',
  name: 'Rhinestone Metallic Baby Tee',
  color: 'silver',
  colors: ['silver'],
  subcategory: 't-shirt',
  fit: 'fitted',
  silhouette: 'cropped',
  formality: 'casual',
  style_tags: ['y2k'],
  aesthetic_tags: ['y2k'],
  occasion_tags: ['party'],
});
const y2kBottom = item({
  category: 'bottom',
  name: 'Low Rise Flare Jeans',
  color: 'blue',
  colors: ['blue'],
  subcategory: 'jeans',
  fit: 'slim',
  silhouette: 'low_rise',
  formality: 'casual',
  style_tags: ['y2k'],
  occasion_tags: ['party'],
});
const y2kShoes = item({
  category: 'shoes',
  name: 'Chunky Platform Sneakers',
  color: 'white',
  colors: ['white'],
  subcategory: 'sneakers',
  silhouette: 'platform',
  formality: 'casual',
  style_tags: ['y2k'],
  occasion_tags: ['party'],
});
const skateSneakers = item({
  category: 'shoes',
  name: 'Skate Sneakers',
  color: 'black',
  colors: ['black'],
  subcategory: 'sneakers',
  formality: 'casual',
  style_tags: ['streetwear'],
  occasion_tags: ['everyday'],
});
const workShirt = item({
  category: 'top',
  name: 'Classic Work Shirt',
  color: 'white',
  colors: ['white'],
  subcategory: 'shirt',
  formality: 'smart_casual',
  style_tags: ['streetwear'],
  occasion_tags: ['work'],
});
const workTrousers = item({
  category: 'bottom',
  name: 'Work Trousers',
  color: 'navy',
  colors: ['navy'],
  subcategory: 'trousers',
  formality: 'smart_casual',
  style_tags: ['streetwear'],
  occasion_tags: ['work'],
});
const loafers = item({
  category: 'shoes',
  name: 'Leather Loafers',
  color: 'brown',
  colors: ['brown'],
  subcategory: 'loafers',
  formality: 'smart_casual',
  style_tags: ['streetwear'],
  occasion_tags: ['work'],
});
const dressShirt = item({
  category: 'top',
  name: 'White Dress Shirt',
  color: 'white',
  colors: ['white'],
  subcategory: 'shirt',
  formality: 'formal',
  style_tags: ['formal'],
  occasion_tags: ['event'],
});
const suitPants = item({
  category: 'bottom',
  name: 'Charcoal Suit Trousers',
  color: 'charcoal',
  colors: ['charcoal'],
  material: 'wool',
  subcategory: 'trousers',
  formality: 'formal',
  style_tags: ['formal'],
  occasion_tags: ['event'],
});
const oxfords = item({
  category: 'shoes',
  name: 'Black Leather Oxfords',
  color: 'black',
  colors: ['black'],
  material: 'leather',
  subcategory: 'oxfords',
  formality: 'formal',
  style_tags: ['formal'],
  occasion_tags: ['event'],
});
const cashmere = item({
  category: 'top',
  name: 'Camel Cashmere Crew',
  color: 'camel',
  colors: ['camel'],
  material: 'cashmere',
  subcategory: 'sweater',
  formality: 'smart_casual',
  style_tags: ['quiet luxury'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});
const tailored = item({
  category: 'bottom',
  name: 'Ivory Tailored Trousers',
  color: 'ivory',
  colors: ['ivory'],
  material: 'wool',
  subcategory: 'trousers',
  formality: 'smart_casual',
  style_tags: ['quiet luxury'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});
const suedeLoafers = item({
  category: 'shoes',
  name: 'Tan Suede Loafers',
  color: 'tan',
  colors: ['tan'],
  material: 'suede',
  subcategory: 'loafers',
  formality: 'smart_casual',
  style_tags: ['quiet luxury'],
  occasion_tags: ['everyday'],
  season_tags: ['all_season'],
});
const turtleneck = item({
  category: 'top',
  name: 'Brown Tweed Turtleneck',
  color: 'brown',
  colors: ['brown'],
  material: 'wool',
  subcategory: 'sweater',
  formality: 'smart_casual',
  style_tags: ['dark academia'],
  occasion_tags: ['school'],
});
const corduroy = item({
  category: 'bottom',
  name: 'Corduroy Trousers',
  color: 'brown',
  colors: ['brown'],
  subcategory: 'trousers',
  formality: 'smart_casual',
  style_tags: ['dark academia'],
  occasion_tags: ['school'],
});
const leatherOxfords = item({
  category: 'shoes',
  name: 'Leather Oxfords',
  color: 'brown',
  colors: ['brown'],
  subcategory: 'oxfords',
  formality: 'smart_casual',
  style_tags: ['dark academia'],
  occasion_tags: ['school'],
});
const schoolHoodie = item({
  category: 'top',
  name: 'School Hoodie',
  color: 'grey',
  colors: ['grey'],
  subcategory: 'hoodie',
  formality: 'casual',
  style_tags: ['casual'],
  occasion_tags: ['school'],
});
const formalTrousers = item({
  category: 'bottom',
  name: 'Formal Wool Trousers',
  color: 'charcoal',
  colors: ['charcoal'],
  material: 'wool',
  subcategory: 'trousers',
  formality: 'formal',
  style_tags: ['formal'],
  occasion_tags: ['event'],
});

const ctx = { season: 'fall' as const, colorPreference: 'style_first' as const };

const genericParty = scoreOutfit([genericHoodie, genericJeans, genericSneakers], {
  ...ctx,
  style: 'Y2K',
  occasion: 'Party',
});
const explicitParty = scoreOutfit([y2kTop, y2kBottom, y2kShoes], {
  ...ctx,
  style: 'Y2K',
  occasion: 'Party',
});
assert(genericParty.breakdown.occasion < 80, '1: generic Y2K+Party occasion is not near-perfect from formality alone');
assert(explicitParty.breakdown.occasion > genericParty.breakdown.occasion, '2: explicit party Y2K outranks generic on occasion');
assert(
  genericParty.issues.some((issue) => /occasion/i.test(issue)),
  '1b: generic party look reports missing occasion evidence',
);

const oneItem = scoreOutfit([y2kTop, genericJeans, genericSneakers], { ...ctx, style: 'Y2K', occasion: 'Party' });
const twoItem = scoreOutfit([y2kTop, y2kBottom, genericSneakers], { ...ctx, style: 'Y2K', occasion: 'Party' });
const threeItem = scoreOutfit([y2kTop, y2kBottom, y2kShoes], { ...ctx, style: 'Y2K', occasion: 'Party' });
assert(oneItem.breakdown.style < twoItem.breakdown.style, '3/4: two-item Y2K evidence beats one-item');
assert(twoItem.breakdown.style < threeItem.breakdown.style, '4/5: three-category Y2K evidence beats two-item');
assert(oneItem.breakdown.style >= 58 && oneItem.breakdown.style <= 76, '3: one-item Y2K is meaningful but limited');
assert(threeItem.breakdown.style >= 84, '5: three-category Y2K is very strong');

const streetWorkGeneric = scoreOutfit([genericHoodie, genericJeans, genericSneakers], {
  ...ctx,
  style: 'Streetwear',
  occasion: 'Work',
});
const streetWorkDressed = scoreOutfit([workShirt, workTrousers, loafers], {
  ...ctx,
  style: 'Streetwear',
  occasion: 'Work',
});
assert(streetWorkGeneric.breakdown.occasion < 80, '6: streetwear hoodie+sneakers is not a strong Work occasion');
assert(streetWorkDressed.breakdown.occasion > streetWorkGeneric.breakdown.occasion, '6b: work shirt/trousers/loafers beat hoodie for Work');

const formalEvent = scoreOutfit([dressShirt, suitPants, oxfords], { ...ctx, style: 'Formal', occasion: 'Event' });
assert(formalEvent.breakdown.occasion >= 80, '7: Formal+Event with dress codes scores strong occasion');
assert(formalEvent.breakdown.style >= 78, '7b: Formal+Event style is strong');

const quietEveryday = scoreOutfit([cashmere, tailored, suedeLoafers], {
  ...ctx,
  style: 'Quiet Luxury',
  occasion: 'Everyday',
});
assert(quietEveryday.breakdown.occasion >= 78, '8: Quiet Luxury+Everyday with everyday tags is a real occasion match');
assert(quietEveryday.breakdown.style >= 78, '8b: Quiet Luxury style is distributed across pieces');

const darkSchool = scoreOutfit([turtleneck, corduroy, leatherOxfords], {
  ...ctx,
  style: 'Dark Academia',
  occasion: 'School',
});
const darkGenericSchool = scoreOutfit([schoolHoodie, genericJeans, genericSneakers], {
  ...ctx,
  style: 'Dark Academia',
  occasion: 'School',
});
assert(darkSchool.breakdown.style > darkGenericSchool.breakdown.style, '9: Dark Academia pieces beat a generic school hoodie');
assert(darkSchool.breakdown.occasion >= darkGenericSchool.breakdown.occasion, '9b: academia school outfit keeps occasion credit');

const highScoreWrongOccasion = scoreOutfit(
  [
    item({
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
    }),
    item({
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
    }),
    item({
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
    }),
  ],
  { ...ctx, style: 'Quiet Luxury', occasion: 'Party' },
);
assert(highScoreWrongOccasion.score >= 78, '10: quiet luxury pieces can still have a high total');
assert(
  highScoreWrongOccasion.issues.some((issue) => /occasion/i.test(issue)),
  '10: a high total does not erase a concrete occasion mismatch',
);

const missingVisual = scoreOutfit(
  [
    item({ category: 'top', name: 'Untagged Shirt', formality: 'casual' }),
    item({ category: 'bottom', name: 'Untagged Pants', formality: 'casual' }),
    item({ category: 'shoes', name: 'Untagged Shoes', formality: 'casual' }),
  ],
  { ...ctx, style: 'Casual', occasion: 'Everyday' },
);
assert(missingVisual.breakdown.color === UNCERTAIN_DIMENSION, '11: missing color metadata is uncertain 50, not a reward');
assert(missingVisual.breakdown.skinTone === 70, '11b: complexion-off stays inapplicable-neutral 70');
assert(missingVisual.breakdown.fit === 70, '11c: missing measurements stay inapplicable-neutral 70');
assert(missingVisual.breakdown.season === UNCERTAIN_DIMENSION, '11d: missing season tags are uncertain 50');

const y2kPartySneakers = scoreOutfit([y2kTop, y2kBottom, y2kShoes], { ...ctx, style: 'Y2K', occasion: 'Party' });
const y2kPartySkate = scoreOutfit([y2kTop, y2kBottom, skateSneakers], { ...ctx, style: 'Y2K', occasion: 'Party' });
assert(y2kPartySneakers.breakdown.cohesion >= y2kPartySkate.breakdown.cohesion, '12: Y2K platform sneakers keep compatibility credit');
assert(
  y2kPartySkate.breakdown.cohesion < 90,
  '13: generic skate sneakers do not make a Party outfit look highly cohesive by themselves',
);

const streetWorkSneakers = scoreOutfit([workShirt, workTrousers, genericSneakers], {
  ...ctx,
  style: 'Streetwear',
  occasion: 'Work',
});
const streetWorkLoafers = scoreOutfit([workShirt, workTrousers, loafers], {
  ...ctx,
  style: 'Streetwear',
  occasion: 'Work',
});
assert(
  streetWorkLoafers.breakdown.cohesion >= streetWorkSneakers.breakdown.cohesion,
  '12b: Work loafers are at least as cohesive as sneakers',
);

const formalSneakers = scoreOutfit([dressShirt, suitPants, genericSneakers], {
  ...ctx,
  style: 'Formal',
  occasion: 'Event',
});
assert(formalEvent.breakdown.cohesion > formalSneakers.breakdown.cohesion, '12c: Formal+Event oxfords beat sneakers');

const contradiction = scoreOutfit([y2kTop, formalTrousers, oxfords], { ...ctx, style: 'Y2K', occasion: 'Party' });
assert(contradiction.breakdown.style < oneItem.breakdown.style, '14: contradictory tailored pieces pull Y2K style down');
assert(
  contradiction.issues.some((issue) => /pulls against|competing style|formality/i.test(issue)),
  '14b: contradictory piece surfaces a concrete issue',
);

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`phase3a: ${passed} passed`);
