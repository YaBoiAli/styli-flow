/**
 * Phase 3: one critic-guided revision, accepted only if scoreOutfit improves by >= 2.
 * Run: npm run test:outfit-score
 */
import { applyOutfitRevision } from './applyOutfitRevision.ts';
import { criticProductsFromCatalog } from './criticInput.ts';
import type { CriticRunResult } from './critiqueWinningOutfit.ts';
import { parseFashionRevisionResult } from './parseFashionRevision.ts';
import { MIN_REVISION_IMPROVEMENT, countChangedItems, shouldAcceptRevision } from './revisionCompare.ts';
import { shouldReviseCritic } from './shouldReviseCritic.ts';
import { toFashionResponseFields } from '../../generate-outfit/attachFashionScore.ts';
import type {
  FashionAIProvider,
  FashionCriticInput,
  FashionCriticResult,
  FashionRevisionResult,
} from './types.ts';

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

function critic(partial: Partial<FashionCriticResult> = {}): FashionCriticResult {
  return {
    overall_assessment: 'acceptable',
    style_match: 8,
    color_harmony: 8,
    proportion: 8,
    occasion_match: 8,
    cohesion: 8,
    strengths: ['Clean palette'],
    issues: [],
    recommendations: [],
    ...partial,
  };
}

assert(!shouldReviseCritic(critic({ overall_assessment: 'strong' })), '1: strong does not revise');
assert(
  !shouldReviseCritic(
    critic({
      overall_assessment: 'acceptable',
      issues: [{ type: 'color', severity: 'minor', product_id: 'top-1' }],
      recommendations: ['Maybe try navy'],
    }),
  ),
  '2: acceptable + minor does not revise',
);
assert(shouldReviseCritic(critic({ overall_assessment: 'weak' })), '3: weak triggers revision');
assert(
  shouldReviseCritic(critic({ issues: [{ type: 'color', severity: 'major' }] })),
  '4: major issue triggers revision',
);
assert(
  shouldReviseCritic(
    critic({
      issues: [
        { type: 'color', severity: 'moderate' },
        { type: 'proportion', severity: 'moderate' },
      ],
    }),
  ),
  '5: multiple moderate issues trigger revision',
);
assert(shouldReviseCritic(critic({ style_match: 5 })), '6: core score <= 5 triggers revision');
assert(!shouldReviseCritic(critic({ style_match: 7, color_harmony: 8 })), '6b: 7–8 does not revise');
assert(!shouldReviseCritic(null), '25: missing critic does not revise');

const originalScore = {
  score: 76,
  breakdown: {
    style: 70,
    color: 70,
    proportion: 70,
    skinTone: 70,
    occasion: 70,
    fit: 70,
    season: 70,
    cohesion: 70,
  },
  issues: ['original-issue'],
  suggestions: ['original-tip'],
};
const betterScore = {
  ...originalScore,
  score: 78,
  issues: ['revised-issue'],
  suggestions: ['revised-tip'],
  breakdown: { ...originalScore.breakdown, cohesion: 80, style: 82, color: 81 },
};

assert(!shouldAcceptRevision(originalScore, { ...originalScore, score: 74 }), '9: lower score rejected');
assert(!shouldAcceptRevision(originalScore, { ...originalScore, score: 76 }), '10: equal score rejected');
assert(!shouldAcceptRevision(originalScore, { ...originalScore, score: 77 }), '11: +1 rejected');
assert(shouldAcceptRevision(originalScore, { ...originalScore, score: 78 }), '12: +2 accepted');
assert(MIN_REVISION_IMPROVEMENT === 2, '27: minimum improvement constant is 2');

assert(countChangedItems(['t1', 'b1', 's1'], ['t1', 'b2', 's1']) === 1, '28: one swapped item');
assert(countChangedItems(['t1', 'b1', 's1'], ['t1', 'b1', 's1']) === 0, '28b: no change');
assert(countChangedItems(['t1', 'b1', 's1'], ['t9', 'b9', 's9']) === 3, '28c: three swaps');

const allowed = new Set(['t1', 'b1', 's1', 'b2']);
assert(
  parseFashionRevisionResult(
    JSON.stringify({ items: [{ product_id: 't1' }, { product_id: 'b2' }, { product_id: 's1' }] }),
    allowed,
  )?.items[1].product_id === 'b2',
  '7: valid revision JSON parses',
);
assert(
  parseFashionRevisionResult('{not-json', allowed) === null,
  '15: malformed revision JSON rejected',
);
assert(
  parseFashionRevisionResult(
    JSON.stringify({ items: [{ product_id: 't1' }, { product_id: 'unknown' }, { product_id: 's1' }] }),
    allowed,
  ) === null,
  '16 / 29: unknown product ID rejected',
);

type Built = { selected: Array<{ product: { id: string; category: string }; reason: string }>; totalPrice: number };
type Product = { id: string; category: string; name: string };

const catalog = {
  t1: { id: 't1', category: 'top', name: 'Tee' },
  b1: { id: 'b1', category: 'bottom', name: 'Jeans' },
  s1: { id: 's1', category: 'shoes', name: 'Sneakers' },
  b2: { id: 'b2', category: 'bottom', name: 'Chinos' },
} as const;

function fakeValidate(outfit: { items: Array<{ product_id: string; reason: string }> }): Built {
  const seen = new Set<string>();
  const selected: Built['selected'] = [];
  for (const item of outfit.items) {
    const product = catalog[item.product_id as keyof typeof catalog];
    if (!product) throw new Error('invalid_ai');
    if (seen.has(product.category)) throw new Error('invalid_ai');
    seen.add(product.category);
    selected.push({ product, reason: item.reason });
  }
  for (const required of ['top', 'bottom', 'shoes']) {
    if (!seen.has(required)) throw new Error('invalid_ai');
  }
  return { selected, totalPrice: 90 };
}

function scoreFor(products: Product[]) {
  const ids = products.map((product) => product.id).join(',');
  if (ids.includes('b2')) return betterScore;
  return originalScore;
}

const originalItems = [
  { product_id: 't1', reason: 'top' },
  { product_id: 'b1', reason: 'bottom' },
  { product_id: 's1', reason: 'shoes' },
];
const originalBuilt = fakeValidate({ items: originalItems });
const originalProducts = originalBuilt.selected.map(({ product }) => product);

const originalCriticRun = (result: FashionCriticResult | undefined, available = true): CriticRunResult => ({
  fashion_critic_available: available,
  fashion_critic: result,
  image_count: available ? 3 : 0,
  reason: available ? undefined : 'no_images',
});

function criticInputFor(products: Product[]): FashionCriticInput {
  return {
    style: 'Casual',
    occasion: 'Everyday',
    products: criticProductsFromCatalog(
      products.map((product) => ({
        ...product,
        brand: 'A',
        image_url: `https://cdn.example.com/${product.id}.jpg`,
      })),
    ),
  };
}

const revisionInput = {
  style: 'Casual',
  occasion: 'Everyday',
  currentOutfit: criticInputFor(originalProducts).products,
  critic: critic({ overall_assessment: 'weak' }),
  catalog: Object.values(catalog).map((product) => ({
    product_id: product.id,
    name: product.name,
    brand: 'A',
    category: product.category,
    subcategory: null,
    color: '',
    colors: [],
    material: null,
    fit: null,
    silhouette: null,
    style_tags: [],
    aesthetic_tags: [],
    occasion_tags: [],
  })),
};

function provider(opts: {
  revision?: FashionRevisionResult | null | 'throw';
  onCritique?: () => void;
}): FashionAIProvider {
  return {
    name: 'mock',
    generateOutfits: async () => {
      throw new Error('not_implemented');
    },
    critiqueOutfit: async (input) => {
      opts.onCritique?.();
      return critic({
        overall_assessment: 'strong',
        strengths: input.products.map((product) => product.product_id),
      });
    },
    reviseOutfit: async () => {
      if (opts.revision === 'throw') throw new Error('provider_error');
      return opts.revision ?? null;
    },
  };
}

async function runRevision(
  criticResult: FashionCriticResult | undefined,
  revision: FashionRevisionResult | null | 'throw',
  extras: {
    available?: boolean;
    validate?: typeof fakeValidate;
    score?: typeof scoreFor;
  } = {},
) {
  let critiqueCalls = 0;
  const result = await applyOutfitRevision({
    critic: criticResult,
    originalCriticRun: originalCriticRun(criticResult, extras.available ?? Boolean(criticResult)),
    original: {
      outfitName: 'Original',
      stylingTip: 'Original tip',
      items: originalItems,
      built: originalBuilt,
      products: originalProducts,
      fashion: originalScore,
    },
    revisionInput: { ...revisionInput, critic: criticResult ?? critic() },
    provider: provider({
      revision,
      onCritique: () => {
        critiqueCalls += 1;
      },
    }),
    validate: extras.validate ?? fakeValidate,
    productsOf: (built) => built.selected.map(({ product }) => product),
    score: extras.score ?? scoreFor,
    critique: async (input) => {
      critiqueCalls += 1;
      return {
        fashion_critic_available: true,
        fashion_critic: critic({
          overall_assessment: 'strong',
          strengths: input.products.map((product) => product.product_id),
        }),
        image_count: input.products.length,
      };
    },
    criticInputFor,
  });
  return { result, critiqueCalls };
}

const goodRevision = {
  items: [{ product_id: 't1' }, { product_id: 'b2' }, { product_id: 's1' }],
};

async function main() {
  const noNeed = await runRevision(critic({ overall_assessment: 'strong' }), goodRevision);
  assert(noNeed.result.revision.fashion_revision_attempted === false, '1b: strong does not call revision path');
  assert(noNeed.critiqueCalls === 0, '20: no revision → no extra critic');
  assert(noNeed.result.fashion.score === 76, '26: fashion_score stays deterministic original');

  const weakAccepted = await runRevision(critic({ overall_assessment: 'weak' }), goodRevision);
  assert(weakAccepted.result.revision.fashion_revision_accepted === true, '13: one-item improve accepted');
  assert(weakAccepted.result.fashion.score === 78, '19: fashion_* replaced on accept');
  assert(weakAccepted.result.fashion.issues[0] === 'revised-issue', '19b: issues replaced');
  assert(weakAccepted.critiqueCalls === 1, '22: accepted revision → one extra critic');
  assert(weakAccepted.result.criticCalls === 2, '22b: two critic calls total recorded');
  assert(
    weakAccepted.result.critic.fashion_critic?.strengths.includes('b2'),
    '24: final critic describes revised outfit',
  );

  const invalidRev = await runRevision(critic({ overall_assessment: 'weak' }), {
    items: [{ product_id: 't1' }, { product_id: 't1' }, { product_id: 's1' }],
  });
  assert(invalidRev.result.revision.fashion_revision_accepted === false, '8 / 17: invalid revision rejected');
  assert(invalidRev.result.fashion.score === 76, '18: original score kept when rejected');
  assert(invalidRev.critiqueCalls === 0, '21: rejected revision → no extra critic');

  const thrown = await runRevision(critic({ overall_assessment: 'weak' }), 'throw');
  assert(thrown.result.revision.fashion_revision_accepted === false, '14: provider throw keeps original');
  assert(thrown.result.fashion.score === 76, '14b: score unchanged after throw');

  const malformed = await runRevision(critic({ overall_assessment: 'weak' }), null);
  assert(malformed.result.revision.fashion_revision_accepted === false, '15b: null revision keeps original');

  const plusOne = await runRevision(
    critic({ overall_assessment: 'weak' }),
    goodRevision,
    { score: () => ({ ...originalScore, score: 77 }) },
  );
  assert(plusOne.result.revision.fashion_revision_accepted === false, '11b: +1 not accepted');
  assert(plusOne.critiqueCalls === 0, '21b: insufficient improvement → one critic only');

  const noImages = await runRevision(undefined, goodRevision, { available: false });
  assert(noImages.result.revision.fashion_revision_attempted === false, '25: no critic → original returned');
  assert(noImages.result.fashion.score === 76, '25b: original still returned');

  const fields = {
    ...toFashionResponseFields(weakAccepted.result.fashion),
    ...weakAccepted.result.revision,
    fashion_critic_available: weakAccepted.result.critic.fashion_critic_available,
  };
  assert(typeof fields.fashion_score === 'number', '30: fashion_score still present');
  assert(typeof fields.fashion_revision_attempted === 'boolean', '30b: revision flags additive');
  assert(fields.fashion_score === 78, '26b: critic numbers are not fashion_score');
  assert(weakAccepted.result.revision.fashion_revision_attempted === true, '23: revision happens at most once');

  if (failed) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\n${passed} passed`);
}

void main();
