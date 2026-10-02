/**
 * Phase 6E: final gender validation uses catalog matchesGenderPreference.
 * Run: npx tsx supabase/functions/generate-outfit/catalog.gender.test.ts
 */
import {
  inferProductGender,
  matchesGenderPreference,
  type CatalogProduct,
  type GenderPreference,
} from './catalog.ts';
import { catalogProduct } from './handlerIntegration.fixtures.ts';
import { validateAndBuild } from './generateHandler.ts';

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

function product(
  id: string,
  extra: Partial<CatalogProduct> & { category?: CatalogProduct['category'] } = {},
): CatalogProduct {
  const created = catalogProduct(id, extra.category ?? 'top', extra);
  return extra.gender === undefined ? created : { ...created, gender: extra.gender };
}

const mensTee = product('mens-tee', { name: 'Graphic Tee', gender: 'men' });
const womensBlouse = product('womens-blouse', { name: 'Satin Blouse', gender: 'women' });
const unisexTee = product('unisex-tee', { name: 'Heavyweight Tee', gender: 'unisex' });
const untaggedTee = product('untagged-tee', { name: 'Cotton Crew Tee', gender: null });
const unknownTee = product('unknown-tee', { name: 'Relaxed Knit Top', gender: 'unknown' });
const mensPants = product('mens-pants', { name: 'Straight Jeans', category: 'bottom', gender: 'men' });
const womensPants = product('womens-pants', { name: 'High Rise Jeans', category: 'bottom', gender: 'women' });
const unisexPants = product('unisex-pants', { name: 'Relaxed Jeans', category: 'bottom', gender: 'unisex' });
const mensShoes = product('mens-shoes', { name: 'Court Sneakers', category: 'shoes', gender: 'men' });
const womensHeels = product('womens-heels', {
  name: 'Kitten Heels',
  category: 'shoes',
  subcategory: 'heels',
  gender: 'women',
});
const unisexShoes = product('unisex-shoes', { name: 'Canvas Sneakers', category: 'shoes', gender: 'unisex' });

assert(!matchesGenderPreference(womensBlouse, 'men'), '1: men rejects explicitly women-only');
assert(!matchesGenderPreference(mensTee, 'women'), '2: women rejects explicitly men-only');
assert(matchesGenderPreference(mensTee, 'men'), '3: men accepts men product');
assert(matchesGenderPreference(womensBlouse, 'women'), '4: women accepts women product');
assert(matchesGenderPreference(unisexTee, 'men'), '5: men accepts unisex');
assert(matchesGenderPreference(unisexTee, 'women'), '6: women accepts unisex');
assert(matchesGenderPreference(mensTee, 'any'), '7: any accepts men');
assert(matchesGenderPreference(womensBlouse, 'any'), '8: any accepts women');
assert(matchesGenderPreference(unisexTee, 'any'), '9: any accepts unisex');

assert(inferProductGender(untaggedTee) === 'unisex', '10: untagged name without cues infers unisex');
assert(inferProductGender(unknownTee) === 'unisex', '10b: stored unknown without cues infers unisex');
assert(matchesGenderPreference(untaggedTee, 'men'), '10c: untagged remains valid for men');
assert(matchesGenderPreference(untaggedTee, 'women'), '10d: untagged remains valid for women');
assert(matchesGenderPreference(untaggedTee, 'any'), '10e: untagged remains valid for any');
assert(inferProductGender(womensHeels) === 'women', 'heels subcategory is women even before stored gender');

const budget = { outfit: 200, shoes: null };
const menMap = new Map<string, CatalogProduct>([
  [mensTee.id, mensTee],
  [womensBlouse.id, womensBlouse],
  [unisexTee.id, unisexTee],
  [untaggedTee.id, untaggedTee],
  [mensPants.id, mensPants],
  [unisexPants.id, unisexPants],
  [mensShoes.id, mensShoes],
  [unisexShoes.id, unisexShoes],
  [womensHeels.id, womensHeels],
  [womensPants.id, womensPants],
]);

function outfit(top: string, bottom: string, shoes: string) {
  return {
    outfit_name: 'Look',
    styling_tip: 'Tip',
    items: [
      { product_id: top, reason: 'top' },
      { product_id: bottom, reason: 'bottom' },
      { product_id: shoes, reason: 'shoes' },
    ],
  };
}

function expectThrow(gender: GenderPreference, ids: [string, string, string], reason: string, message: string) {
  let threw = '';
  try {
    validateAndBuild(outfit(...ids), menMap, budget, 'include', gender);
  } catch (err) {
    threw = err instanceof Error ? err.message : 'unknown';
  }
  assert(threw === reason, message);
}

function expectOk(gender: GenderPreference, ids: [string, string, string], message: string) {
  const built = validateAndBuild(outfit(...ids), menMap, budget, 'include', gender);
  assert(built.selected.length === 3, message);
}

expectThrow('men', [womensBlouse.id, mensPants.id, mensShoes.id], 'gender_mismatch', 'validate: men + women top is gender_mismatch');
expectThrow('women', [mensTee.id, womensPants.id, womensHeels.id], 'gender_mismatch', 'validate: women + men top is gender_mismatch');
expectOk('men', [mensTee.id, mensPants.id, mensShoes.id], 'validate: men + men outfit is accepted');
expectOk('women', [womensBlouse.id, womensPants.id, womensHeels.id], 'validate: women + women outfit is accepted');
expectOk('men', [unisexTee.id, unisexPants.id, unisexShoes.id], 'validate: men + unisex outfit is accepted');
expectOk('women', [unisexTee.id, unisexPants.id, unisexShoes.id], 'validate: women + unisex outfit is accepted');
expectOk('any', [mensTee.id, mensPants.id, mensShoes.id], 'validate: any + men outfit is accepted');
expectOk('any', [womensBlouse.id, womensPants.id, womensHeels.id], 'validate: any + women outfit is accepted');
expectOk('any', [unisexTee.id, unisexPants.id, unisexShoes.id], 'validate: any + unisex outfit is accepted');
expectOk('men', [untaggedTee.id, unisexPants.id, unisexShoes.id], 'validate: men + untagged follows existing unisex policy');
expectOk('women', [untaggedTee.id, unisexPants.id, unisexShoes.id], 'validate: women + untagged follows existing unisex policy');

const noShoesBuilt = validateAndBuild(
  {
    outfit_name: 'No Shoes',
    styling_tip: 'Tip',
    items: [
      { product_id: mensTee.id, reason: 'top' },
      { product_id: mensPants.id, reason: 'bottom' },
    ],
  },
  menMap,
  budget,
  'none',
  'men',
);
assert(noShoesBuilt.selected.length === 2, 'No Shoes: gender check does not require shoes');
assert(
  noShoesBuilt.selected.every((row) => row.product.category !== 'shoes'),
  'No Shoes: gender check does not introduce footwear',
);

if (failed) {
  console.error(`\ncatalog.gender tests: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`catalog.gender tests: ${passed} passed`);
