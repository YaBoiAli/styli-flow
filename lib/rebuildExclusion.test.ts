/**
 * Phase 4: client rebuild exclusion state.
 * Run: npx tsx lib/rebuildExclusion.test.ts
 */
import type { Outfit, Product } from '../types';
import {
  excludeProductIdsFromPrevious,
  nextRebuildSnapshot,
  snapshotOutfitForRebuild,
} from './rebuildExclusion.ts';

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
  category: Product['category'],
  extra: Partial<Product> = {},
): Product {
  return {
    id,
    name: extra.name ?? `${category} ${id}`,
    price: extra.price ?? 40,
    imageUrl: extra.imageUrl ?? 'https://cdn.example.com/a.jpg',
    category,
    brand: extra.brand ?? 'Acme',
    color: extra.color ?? 'black',
  };
}

function outfit(products: Product[]): Outfit {
  return {
    id: 'look-1',
    name: 'Look',
    style: 'Streetwear',
    occasion: 'Everyday',
    products,
    total: products.reduce((sum, item) => sum + item.price, 0),
    explanation: 'Tip',
  };
}

assert(excludeProductIdsFromPrevious([]).length === 0, 'first generation has no exclusions');

const withShoes = outfit([
  product('channel3:top-1', 'top'),
  product('channel3:bottom-1', 'bottom'),
  product('channel3:shoe-1', 'footwear'),
]);
const withShoesIds = excludeProductIdsFromPrevious(snapshotOutfitForRebuild(withShoes));
assert(withShoesIds.includes('channel3:top-1'), 'rebuild excludes previous top');
assert(withShoesIds.includes('channel3:bottom-1'), 'rebuild excludes previous bottom');
assert(withShoesIds.includes('channel3:shoe-1'), 'rebuild excludes previous shoes');
assert(withShoesIds.length === 3, 'rebuild sends exactly the previous product IDs');
assert(
  snapshotOutfitForRebuild(withShoes).find((item) => item.productId === 'channel3:shoe-1')?.category === 'shoes',
  'footwear maps to shoes category without changing the product ID',
);

const noShoes = outfit([
  product('stored-top', 'top'),
  product('stored-bottom', 'bottom'),
]);
const noShoesIds = excludeProductIdsFromPrevious(snapshotOutfitForRebuild(noShoes));
assert(noShoesIds.includes('stored-top'), 'no-shoes rebuild excludes previous top');
assert(noShoesIds.includes('stored-bottom'), 'no-shoes rebuild excludes previous bottom');
assert(!noShoesIds.some((id) => /shoe|footwear/i.test(id)), 'no-shoes rebuild does not invent a shoe ID');
assert(noShoesIds.length === 2, 'no-shoes rebuild excludes only existing products');

const successful = snapshotOutfitForRebuild(withShoes);
assert(
  nextRebuildSnapshot(successful, null) === successful,
  'failed rebuild retains the last successful previous outfit',
);
assert(
  nextRebuildSnapshot(successful, null).map((item) => item.productId).join(',') ===
    'channel3:top-1,channel3:bottom-1,channel3:shoe-1',
  'failed rebuild does not replace successful IDs with an empty snapshot',
);

const later = outfit([
  product('channel3:top-2', 'top'),
  product('channel3:bottom-2', 'bottom'),
  product('channel3:shoe-2', 'footwear'),
]);
const replaced = nextRebuildSnapshot(successful, later);
assert(replaced[0]?.productId === 'channel3:top-2', 'successful outfit replaces the rebuild snapshot');
assert(!replaced.some((item) => item.productId === 'channel3:top-1'), 'new success does not keep stale IDs');

console.log(`rebuildExclusion client tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} rebuildExclusion client test(s) failed`);
}
