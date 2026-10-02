/**
 * Rebuild diversity: quality-first spreading, soft reuse penalty, selection band.
 * Run: npm run test:outfit-score
 */
import {
  assertNoForbiddenFootwear,
  assertValidOutfitCategories,
} from './footwearPreference.ts';
import {
  evaluateOutfitCandidates,
  selectBestScoredCandidate,
  type AiOutfit,
  type ScoredOutfitCandidate,
} from './outfitCandidates.ts';
import type { ProductCategory } from './catalog.ts';
import {
  candidateInterpretationGuide,
  candidateInterpretationOptions,
  REBUILD_OUTFIT_INSTRUCTION,
  candidatesShareTooManyProducts,
  countChangedPieces,
  outfitDiversityScore,
  parsePreviousOutfit,
  productGroupKey,
  productIdentityKey,
  reusePenalty,
  spreadAcrossGroups,
  uniqueProductIds,
  type DiversityProduct,
  type PreviousOutfitItem,
} from './outfitDiversity.ts';
import type { OutfitScoreBreakdown } from '../_shared/catalog/outfitScoring.ts';

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

function item(
  partial: Partial<DiversityProduct> & Pick<DiversityProduct, 'id' | 'name' | 'category'>,
): DiversityProduct {
  return {
    brand: 'Brand',
    color: 'black',
    ...partial,
  };
}

const previousStreet: PreviousOutfitItem[] = [
  { product_id: 'hoodie-a', name: 'Oversized Gray Hoodie', brand: 'Brand', category: 'top', color: 'gray' },
  { product_id: 'joggers-a', name: '2063 Baggy Joggers', brand: 'Brand', category: 'bottom', color: 'black' },
  { product_id: 'sneaker-a', name: 'Black Sneakers', brand: 'Brand', category: 'shoes', color: 'black' },
];

assert(productGroupKey(item({ id: 'j', name: '2063 Baggy Joggers', category: 'bottom' })) === 'joggers', 'group: baggy joggers stay joggers');
assert(productGroupKey(item({ id: 'c', name: 'Cargo Pants', category: 'bottom' })) === 'cargos', 'group: cargos');
assert(productGroupKey(item({ id: 'd', name: 'Straight Jeans', category: 'bottom' })) === 'straight_jeans', 'group: straight jeans');
assert(productGroupKey(item({ id: 'h', name: 'Oversized Gray Hoodie', category: 'top' })) === 'hoodie', 'group: hoodie');
assert(productGroupKey(item({ id: 't', name: 'Heavyweight Tee', category: 'top' })) === 'heavyweight_tee', 'group: heavyweight tee');

const joggers = Array.from({ length: 10 }, (_, index) =>
  item({
    id: `jogger-${index}`,
    name: '2063 Baggy Joggers',
    category: 'bottom',
    subcategory: 'joggers',
  }),
);
const cargo = item({ id: 'cargo-1', name: 'Relaxed Cargo Pants', category: 'bottom', subcategory: 'cargos' });
const jeans = item({ id: 'jeans-1', name: 'Straight Jeans', category: 'bottom' });
const trousers = item({ id: 'trouser-1', name: 'Relaxed Trousers', category: 'bottom' });
const chinos = item({ id: 'chino-1', name: 'Slim Chinos', category: 'bottom' });

const similarBottoms = [...joggers, cargo, jeans, trousers, chinos];
const scoreMap = new Map<string, number>([
  ...joggers.map((product) => [product.id, 18] as const),
  ['cargo-1', 16],
  ['jeans-1', 16],
  ['trouser-1', 15],
  ['chino-1', 9],
]);
const spread = spreadAcrossGroups(similarBottoms, (product) => scoreMap.get(product.id) ?? 0, 7);
const spreadGroups = new Set(spread.map(productGroupKey));
assert(spread.some((product) => product.id === 'cargo-1'), '1: similarly strong cargos enter the working pool');
assert(spread.some((product) => product.id === 'jeans-1'), '1: similarly strong jeans enter the working pool');
assert(spreadGroups.size >= 3, '1: shortlist spans multiple bottom groups');
assert(spread.filter((product) => productGroupKey(product) === 'joggers').length < 7, '1: joggers do not fill the whole shortlist');
assert(!spread.some((product) => product.id === 'chino-1'), 'style: weak chinos stay out of a streetwear-quality band');

const previousOnly = item({ id: 'joggers-a', name: '2063 Baggy Joggers', category: 'bottom', subcategory: 'joggers' });
const deferred = spreadAcrossGroups(
  [previousOnly, cargo, jeans, trousers],
  (product) => (product.id === 'joggers-a' ? 18 : 17),
  3,
  4,
  { defer: (product) => product.id === 'joggers-a' },
);
assert(deferred[0].id !== 'joggers-a', '13: previous product is not the first pick when alternatives exist');
assert(deferred.some((product) => product.id === 'cargo-1' || product.id === 'jeans-1'), '14: strong alternatives replace previous');

const noAlternative = spreadAcrossGroups(
  [previousOnly],
  () => 18,
  1,
  4,
  { defer: (product) => product.id === 'joggers-a' },
);
assert(noAlternative[0]?.id === 'joggers-a', '15: previous product can still be used if it is the only option');

const firstGenSpread = spreadAcrossGroups(
  [previousOnly, cargo, jeans],
  (product) => (product.id === 'joggers-a' ? 18 : 16),
  3,
);
assert(firstGenSpread[0].id === 'joggers-a', '16: normal generation has no previous-product deferral');

const weakSpread = spreadAcrossGroups(
  [...joggers, chinos],
  (product) => (product.id.startsWith('jogger') ? 18 : 9),
  7,
);
assert(
  !weakSpread.some((product) => product.id === 'chino-1'),
  'quality: substantially weaker group is not pulled in for novelty',
);

assert(
  reusePenalty(item({ id: 'joggers-a', name: '2063 Baggy Joggers', category: 'bottom' }), previousStreet) === 2.5,
  '2: previous identity gets the identity penalty',
);
assert(
  reusePenalty(item({ id: 'jogger-new', name: 'Other Baggy Joggers', category: 'bottom' }), previousStreet) === 1,
  '2: same group gets a lighter penalty',
);
assert(
  reusePenalty(item({ id: 'cargo-1', name: 'Relaxed Cargo Pants', category: 'bottom' }), previousStreet) === 0,
  '2: different group is unpenalized',
);

const previousBottom = item({ id: 'joggers-a', name: '2063 Baggy Joggers', category: 'bottom' });
const rankedWithPenalty = [previousBottom, ...joggers.slice(0, 2), cargo, jeans]
  .map((product) => ({
    product,
    score: (product.id === 'joggers-a' ? 18 : scoreMap.get(product.id) ?? 16) - reusePenalty(product, previousStreet),
  }))
  .sort((a, b) => b.score - a.score);
assert(
  rankedWithPenalty[0].product.id !== 'joggers-a',
  '2: previous bottom does not keep first rank when alternatives are similarly strong',
);
assert(
  rankedWithPenalty.some((row) => row.product.id === 'cargo-1' && row.score >= rankedWithPenalty[0].score - 2),
  '2: cargo remains competitive after the soft penalty',
);

function breakdown(partial: Partial<OutfitScoreBreakdown> = {}): OutfitScoreBreakdown {
  return {
    style: 70,
    color: 70,
    proportion: 70,
    skinTone: 70,
    occasion: 70,
    fit: 70,
    season: 70,
    cohesion: 70,
    ...partial,
  };
}

function scored(
  index: number,
  score: number,
  products: DiversityProduct[],
): Extract<ScoredOutfitCandidate<DiversityProduct[]>, { valid: true }> {
  const sheet = breakdown();
  return {
    valid: true,
    index,
    score,
    breakdown: sheet,
    issues: [],
    suggestions: [],
    fashion: { score, breakdown: sheet, issues: [], suggestions: [] },
    outfit: {
      outfit_name: `Look ${index}`,
      styling_tip: 'Tip',
      items: products.map((product) => ({ product_id: product.id, reason: '' })),
    },
    built: products,
  };
}

const sameAsPrevious = [
  item({ id: 'hoodie-a', name: 'Oversized Gray Hoodie', category: 'top', color: 'gray' }),
  item({ id: 'joggers-a', name: '2063 Baggy Joggers', category: 'bottom' }),
  item({ id: 'sneaker-a', name: 'Black Sneakers', category: 'shoes' }),
];
const twoPieceChange = [
  item({ id: 'tee-b', name: 'Heavyweight Tee', category: 'top', color: 'white' }),
  item({ id: 'jeans-b', name: 'Straight Jeans', category: 'bottom', color: 'blue' }),
  item({ id: 'sneaker-a', name: 'Black Sneakers', category: 'shoes' }),
];
const threePieceChange = [
  item({ id: 'overshirt-c', name: 'Overshirt', category: 'top', color: 'green' }),
  item({ id: 'cargo-c', name: 'Cargo Pants', category: 'bottom', color: 'olive' }),
  item({ id: 'boot-c', name: 'Chelsea Boots', category: 'shoes', color: 'brown' }),
];
const weakChange = [
  item({ id: 'random-shirt', name: 'Dress Shirt', category: 'top' }),
  item({ id: 'chino-weak', name: 'Slim Chinos', category: 'bottom' }),
  item({ id: 'loafer-weak', name: 'Loafers', category: 'shoes' }),
];

assert(countChangedPieces(twoPieceChange, previousStreet) >= 2, '1: two-piece change is detected');
assert(countChangedPieces(sameAsPrevious, previousStreet) === 0, '1: identical outfit has zero changes');

const rebuildClose = selectBestScoredCandidate(
  [
    scored(0, 86, sameAsPrevious),
    scored(1, 84, twoPieceChange),
    scored(2, 83, threePieceChange),
  ],
  {
    previousOutfit: previousStreet,
    productsOf: (built) => built,
    footwearPreference: 'include',
  },
);
assert(rebuildClose?.index !== 0, '1: rebuild prefers changing pieces when scores are close');
assert(
  countChangedPieces(rebuildClose?.built ?? [], previousStreet) >= 2,
  '1: rebuild winner changes at least two pieces when alternatives exist',
);

const qualityFirst = selectBestScoredCandidate(
  [
    scored(0, 90, sameAsPrevious),
    scored(1, 74, threePieceChange),
  ],
  {
    previousOutfit: previousStreet,
    productsOf: (built) => built,
    footwearPreference: 'include',
  },
);
assert(qualityFirst?.index === 0, '3: diversity never beats a substantially better outfit');
assert(qualityFirst?.score === 90, '3: fashion_score stays on the stronger outfit');
assert(
  outfitDiversityScore(sameAsPrevious, previousStreet) < outfitDiversityScore(threePieceChange, previousStreet),
  '3: diversity metric is separate from fashion_score',
);

const firstGen = selectBestScoredCandidate(
  [
    scored(0, 86, sameAsPrevious),
    scored(1, 84, threePieceChange),
  ],
  {
    previousOutfit: [],
    productsOf: (built) => built,
  },
);
assert(firstGen?.index === 0, '5: first generation with no previous outfit still picks the strongest');

const onlyBottom = [
  item({ id: 'hoodie-b', name: 'Zip Hoodie', category: 'top' }),
  item({ id: 'joggers-a', name: '2063 Baggy Joggers', category: 'bottom' }),
  item({ id: 'sneaker-b', name: 'White Sneakers', category: 'shoes' }),
];
const oneBottomWinner = selectBestScoredCandidate(
  [scored(0, 81, onlyBottom)],
  {
    previousOutfit: previousStreet,
    productsOf: (built) => built,
    footwearPreference: 'include',
  },
);
assert(oneBottomWinner?.built.some((product) => product.id === 'joggers-a') === true, '8: one viable bottom may be reused');

const noShoesPrev: PreviousOutfitItem[] = previousStreet.filter((row) => row.category !== 'shoes');
const noShoesChange = [
  item({ id: 'tee-b', name: 'Heavyweight Tee', category: 'top' }),
  item({ id: 'jeans-b', name: 'Straight Jeans', category: 'bottom' }),
];
const noShoesSame = [
  item({ id: 'hoodie-a', name: 'Oversized Gray Hoodie', category: 'top' }),
  item({ id: 'joggers-a', name: '2063 Baggy Joggers', category: 'bottom' }),
];
const noShoesPick = selectBestScoredCandidate(
  [scored(0, 80, noShoesSame), scored(1, 79, noShoesChange)],
  {
    previousOutfit: noShoesPrev,
    productsOf: (built) => built,
    footwearPreference: 'none',
  },
);
assert(
  countChangedPieces(noShoesPick?.built ?? [], noShoesPrev) >= 2,
  '1b: no-shoes rebuild prefers changing both pieces when alternatives exist',
);

const catalog = new Map([
  ['t1', item({ id: 't1', name: 'Hoodie', category: 'top' })],
  ['b1', item({ id: 'b1', name: 'Joggers', category: 'bottom' })],
  ['s1', item({ id: 's1', name: 'Sneakers', category: 'shoes' })],
  ['t2', item({ id: 't2', name: 'Tee', category: 'top' })],
  ['b2', item({ id: 'b2', name: 'Jeans', category: 'bottom' })],
  ['s2', item({ id: 's2', name: 'Boots', category: 'shoes' })],
]);

function outfit(ids: string[]): AiOutfit {
  return {
    outfit_name: ids.join('-'),
    styling_tip: 'Tip',
    items: ids.map((id) => ({ product_id: id, reason: '' })),
  };
}

function categoriesOf(products: DiversityProduct[]): ProductCategory[] {
  return products.map((product) => product.category as ProductCategory);
}

function validateInclude(candidate: AiOutfit) {
  const products = candidate.items.map((row) => {
    const product = catalog.get(row.product_id);
    if (!product) throw new Error('invalid_ai');
    return product;
  });
  assertValidOutfitCategories(categoriesOf(products), 'include');
  return products;
}

function validateNone(candidate: AiOutfit) {
  const products = candidate.items.map((row) => {
    const product = catalog.get(row.product_id);
    if (!product) throw new Error('invalid_ai');
    return product;
  });
  assertValidOutfitCategories(categoriesOf(products), 'none');
  assertNoForbiddenFootwear(products, 'none');
  return products;
}

const fashion = (score: number) => ({
  score,
  breakdown: breakdown(),
  issues: [],
  suggestions: [],
});

const invented = evaluateOutfitCandidates({
  outfits: [outfit(['t1', 'ghost-bottom', 's1'])],
  excludeIds: new Set<string>(),
  validate: validateInclude,
  productsOf: (products) => products,
  score: () => fashion(88),
  previousOutfit: previousStreet,
  footwearPreference: 'include',
});
assert(invented.winner === null, '9: rebuild does not invent products');
assert(invented.candidates[0]?.valid === false, '9: unknown ids stay invalid_ai');

const noShoesReject = evaluateOutfitCandidates({
  outfits: [outfit(['t1', 'b1', 's1'])],
  excludeIds: new Set<string>(),
  validate: validateNone,
  productsOf: (products) => products,
  score: () => fashion(90),
  previousOutfit: noShoesPrev,
  footwearPreference: 'none',
});
assert(noShoesReject.winner === null, '6: No Shoes remains a hard rejection even on rebuild');

const includeRequiresShoes = evaluateOutfitCandidates({
  outfits: [outfit(['t1', 'b1']), outfit(['t2', 'b2', 's2'])],
  excludeIds: new Set<string>(),
  validate: validateInclude,
  productsOf: (products) => products,
  score: (products) => fashion(products.some((product) => product.category === 'shoes') ? 82 : 99),
  previousOutfit: previousStreet,
  footwearPreference: 'include',
});
assert(includeRequiresShoes.winner !== null, '7: include still produces a complete outfit');
assert(
  includeRequiresShoes.winner!.built.some((product) => product.category === 'shoes'),
  '7: include still requires shoes',
);
assert(
  includeRequiresShoes.winner!.score === 82,
  '7: a higher-scoring incomplete outfit cannot win just to be different',
);

const similarFive: AiOutfit[] = Array.from({ length: 5 }, () => outfit(['t1', 'b1', 's1']));
const diverseFive: AiOutfit[] = [
  outfit(['t1', 'b1', 's1']),
  outfit(['t2', 'b2', 's2']),
  outfit(['t1', 'b2', 's2']),
  outfit(['t2', 'b1', 's1']),
  outfit(['t2', 'b2', 's1']),
];
assert(candidatesShareTooManyProducts(similarFive), '4: five clones are not meaningful candidate diversity');
assert(!candidatesShareTooManyProducts(diverseFive), '4: five mixed product sets count as diverse');
assert(
  candidatesShareTooManyProducts([
    outfit(['top-A', 'bottom-B', 'shoes-C']),
    outfit(['top-A', 'bottom-B', 'shoes-F']),
  ]),
  '6d: 2/3 overlap with a previous rebuild outfit is a near-clone',
);
assert(
  !candidatesShareTooManyProducts([
    outfit(['top-A', 'bottom-B', 'shoes-C']),
    outfit(['top-G', 'bottom-H', 'shoes-F']),
  ]),
  '6d: 1/3 overlap with a previous rebuild outfit remains eligible',
);
assert(
  candidatesShareTooManyProducts([
    outfit(['top-A', 'bottom-B']),
    outfit(['top-A', 'bottom-C']),
  ]),
  '6d: No Shoes sharing one piece is a near-clone under the existing helper',
);
assert(uniqueProductIds(diverseFive).size >= 5, '4: diverse candidates use more than one product per slot');
const streetwearGuide = candidateInterpretationGuide('Streetwear');
assert(streetwearGuide.includes('clean/minimal'), '4: interpretation guide lists clean/minimal');
assert(streetwearGuide.includes('more relaxed/baggy'), '4: volume-friendly Streetwear can suggest relaxed/baggy');
assert(
  candidateInterpretationOptions('Streetwear').includes('color-forward'),
  '4: intensity-friendly Streetwear can suggest color-forward',
);
assert(
  !candidateInterpretationOptions('Quiet Luxury').includes('more relaxed/baggy'),
  '4: Quiet Luxury omits baggy when volumeFriendly=false',
);
assert(
  !candidateInterpretationOptions('Minimalist').includes('color-forward'),
  '4: Minimalist omits color-forward when intensityFriendly=false',
);
assert(streetwearGuide.includes('Do not invent products'), '4: interpretations may not invent products');
assert(REBUILD_OUTFIT_INSTRUCTION.includes('Prefer replacing at least two pieces'), 'rebuild instruction asks for two-piece change');
assert(
  streetwearGuide.includes('Stay recognizably in the requested style'),
  '7: diversity must not override style',
);

assert(outfitDiversityScore(threePieceChange, []) === 100, '5: diversity score is inert without a previous outfit');
assert(outfitDiversityScore(weakChange, previousStreet) > outfitDiversityScore(sameAsPrevious, previousStreet), 'diversity metric rewards change');
assert(
  parsePreviousOutfit(['hoodie-a', { product_id: 'joggers-a', name: '2063 Baggy Joggers', category: 'bottom' }]).length === 2,
  'previous_outfit_product_ids parse',
);
assert(
  productIdentityKey({ name: '2063 Baggy Joggers', brand: 'Brand', category: 'bottom' }) ===
    productIdentityKey({ id: 'other-id', name: '2063 Baggy Joggers', brand: 'Brand', category: 'bottom' }),
  'identity: Channel3 id churn still matches the same named product',
);

console.log(`outfitDiversity tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} outfitDiversity test(s) failed`);
}
