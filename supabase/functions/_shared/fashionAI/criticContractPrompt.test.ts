/**
 * Phase 5C: canonical STYLE_CONTRACT / OCCASION_CONTRACT in critic + revision.
 * Run: npx tsx supabase/functions/_shared/fashionAI/criticContractPrompt.test.ts
 */
import { OCCASIONS, STYLES } from '../../../../types/index.ts';
import {
  OCCASION_CONTRACT,
  STYLE_CONTRACT,
  occasionContractFor,
  styleContractFor,
} from '../catalog/styleOccasionContract.ts';
import { emptyVisualAttributes } from '../catalog/visualAttributes.ts';
import { applyOutfitRevision } from './applyOutfitRevision.ts';
import {
  buildCriticContractContext,
  buildCriticPrompt,
  buildCriticUserPayload,
  buildRevisionPrompt,
  buildRevisionUserPayload,
} from './criticContractPrompt.ts';
import { revisionCatalogFromProducts, type CatalogLike } from './criticInput.ts';
import { parseFashionRevisionResult } from './parseFashionRevision.ts';
import { MIN_REVISION_IMPROVEMENT, shouldAcceptRevision } from './revisionCompare.ts';
import type {
  FashionAIProvider,
  FashionCriticInput,
  FashionCriticResult,
  FashionRevisionInput,
  FashionRevisionResult,
} from './types.ts';

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

const product = {
  product_id: 't1',
  name: 'Tee',
  brand: 'A',
  category: 'top',
  subcategory: null,
  color: 'black',
  colors: ['black'],
  material: null,
  fit: null,
  silhouette: null,
  style_tags: [] as string[],
  aesthetic_tags: [] as string[],
  occasion_tags: [] as string[],
  image_url: 'https://cdn.example.com/t1.jpg',
  image_available: true,
};

function criticInput(
  style: string,
  occasion: string,
  extras: Partial<FashionCriticInput> = {},
): FashionCriticInput {
  return {
    style,
    occasion,
    products: [product],
    ...extras,
  };
}

function criticResult(partial: Partial<FashionCriticResult> = {}): FashionCriticResult {
  return {
    overall_assessment: 'weak',
    style_match: 4,
    color_harmony: 8,
    proportion: 8,
    occasion_match: 8,
    cohesion: 8,
    strengths: [],
    issues: [{ type: 'style', severity: 'major', product_id: 'b1' }],
    recommendations: ['Swap the bottom'],
    ...partial,
  };
}

function revisionInput(
  style: string,
  occasion: string,
  extras: Partial<FashionRevisionInput> = {},
): FashionRevisionInput {
  return {
    style,
    occasion,
    currentOutfit: [product],
    critic: criticResult(),
    catalog: [
      {
        product_id: 't1',
        name: 'Tee',
        brand: 'A',
        category: 'top',
        subcategory: null,
        color: 'black',
        colors: ['black'],
        material: null,
        fit: null,
        silhouette: null,
        style_tags: [],
        aesthetic_tags: [],
        occasion_tags: [],
      },
    ],
    ...extras,
  };
}

for (const style of STYLES) {
  const context = buildCriticContractContext(style, 'Everyday');
  assert(context.style !== null, `${style}: critic contract context resolves`);
  assert(
    context.style?.critic_interpretation === STYLE_CONTRACT[style].criticInterpretation,
    `${style}: critic_interpretation comes from STYLE_CONTRACT.criticInterpretation`,
  );
  assert(context.style?.label === STYLE_CONTRACT[style].label, `${style}: canonical critic label`);
  assert(
    Boolean(STYLE_CONTRACT[style].criticInterpretation.trim()),
    `${style}: criticInterpretation is present on the canonical contract`,
  );
}

for (const occasion of OCCASIONS) {
  const context = buildCriticContractContext('Streetwear', occasion);
  assert(context.occasion !== null, `${occasion}: critic occasion contract resolves`);
  assert(
    context.occasion?.rules === OCCASION_CONTRACT[occasion].geminiRules,
    `${occasion}: critic rules come from OCCASION_CONTRACT.geminiRules`,
  );
  assert(context.occasion?.label === OCCASION_CONTRACT[occasion].label, `${occasion}: canonical critic occasion label`);
  assert(
    context.occasion?.classy_footwear === OCCASION_CONTRACT[occasion].classyFootwear,
    `${occasion}: classy_footwear comes from OCCASION_CONTRACT`,
  );
  assert(
    JSON.stringify(context.occasion?.accepted_formality) ===
      JSON.stringify(OCCASION_CONTRACT[occasion].acceptedFormality),
    `${occasion}: accepted_formality comes from OCCASION_CONTRACT`,
  );
}

const y2kPartyCritic = buildCriticPrompt(criticInput('Y2K', 'Party'));
assert(y2kPartyCritic.includes('STYLE CONTRACT'), '1: critic prompt has STYLE CONTRACT section');
assert(y2kPartyCritic.includes('OCCASION CONTRACT'), '2: critic prompt has OCCASION CONTRACT section');
assert(
  y2kPartyCritic.includes(STYLE_CONTRACT.Y2K.criticInterpretation),
  '1: critic prompt includes canonical STYLE_CONTRACT criticInterpretation',
);
assert(
  y2kPartyCritic.includes(OCCASION_CONTRACT.Party.geminiRules),
  '2: critic prompt includes canonical OCCASION_CONTRACT rules',
);
assert(y2kPartyCritic.includes('"accepted_formality"'), '2: critic prompt includes accepted_formality');
assert(y2kPartyCritic.includes('"classy_footwear"'), '2: critic prompt includes classy_footwear');
assert(
  y2kPartyCritic.includes('Treat the supplied style and occasion as canonical'),
  'critic treats style/occasion as canonical',
);
assert(
  y2kPartyCritic.includes('Do not reinterpret the requested vibe'),
  'critic must not reinterpret the requested vibe',
);
assert(
  y2kPartyCritic.includes('The critic is advisory'),
  'critic remains advisory',
);
assert(
  y2kPartyCritic.includes('Deterministic server validation and scoring remain authoritative'),
  'server scoring remains authoritative in critic prompt',
);
assert(
  !y2kPartyCritic.includes(STYLE_CONTRACT.Y2K.geminiInterpretation),
  '3: critic does not copy geminiInterpretation as a second style vocabulary',
);
assert(
  !y2kPartyCritic.includes('Y2K 2000s graphic tee'),
  '3: critic does not dump retrievalConcepts',
);
assert(!y2kPartyCritic.includes(STYLES.join(', ')), '3: critic has no hardcoded style menu');
assert(
  !y2kPartyCritic.includes(STYLE_CONTRACT.Streetwear.criticInterpretation),
  '3: Y2K critic prompt does not include Streetwear criticInterpretation',
);
assert(y2kPartyCritic.includes('"overall_assessment"'), 'critic JSON schema is preserved');
assert(y2kPartyCritic.includes('"style_match"'), 'critic schema keeps style_match');
assert(y2kPartyCritic.includes('"occasion_match"'), 'critic schema keeps occasion_match');

const y2kPartyRevision = buildRevisionPrompt(revisionInput('Y2K', 'Party'));
assert(
  y2kPartyRevision.includes(STYLE_CONTRACT.Y2K.criticInterpretation),
  '4: revision prompt includes the same canonical style contract',
);
assert(
  y2kPartyRevision.includes(OCCASION_CONTRACT.Party.geminiRules),
  '5: revision prompt includes the occasion contract',
);
assert(y2kPartyRevision.includes('STYLE CONTRACT'), '4: revision prompt has STYLE CONTRACT section');
assert(y2kPartyRevision.includes('OCCASION CONTRACT'), '5: revision prompt has OCCASION CONTRACT section');
assert(
  y2kPartyRevision.includes('preserving the requested canonical style and occasion'),
  'revision preserves canonical style/occasion',
);
assert(
  y2kPartyRevision.includes('Only change products when the critic identifies a concrete weakness'),
  'revision is critic-driven, not automatic',
);
assert(
  !y2kPartyRevision.includes(STYLE_CONTRACT.Y2K.geminiInterpretation),
  'revision does not use geminiInterpretation as a second vocabulary',
);
assert(!y2kPartyRevision.includes('Y2K 2000s graphic tee'), 'revision does not dump retrievalConcepts');

const criticUser = buildCriticUserPayload(criticInput('Y2K', 'Party'));
assert(
  criticUser.style_contract?.critic_interpretation === STYLE_CONTRACT.Y2K.criticInterpretation,
  'critic user payload carries STYLE_CONTRACT criticInterpretation',
);
assert(
  criticUser.occasion_contract?.rules === OCCASION_CONTRACT.Party.geminiRules,
  'critic user payload carries OCCASION_CONTRACT rules',
);
const revisionUser = buildRevisionUserPayload(revisionInput('Y2K', 'Party'));
assert(
  revisionUser.style_contract?.critic_interpretation ===
    criticUser.style_contract?.critic_interpretation,
  'revision user payload uses the same style contract as the critic',
);
assert(
  revisionUser.occasion_contract?.rules === criticUser.occasion_contract?.rules,
  'revision user payload uses the same occasion contract as the critic',
);

const eventFromAlias = buildCriticContractContext('Formal', 'formal event');
assert(eventFromAlias.occasion !== null, '6: formal event alias resolves for critic');
assert(eventFromAlias.occasion?.label === 'Event', '6: formal event alias uses canonical Event');
assert(
  eventFromAlias.occasion?.rules === OCCASION_CONTRACT.Event.geminiRules,
  '6: formal event alias uses Event geminiRules',
);
assert(
  occasionContractFor('Event') === occasionContractFor('formal event'),
  '6: Event and formal event are the same contract record',
);
const eventCritic = buildCriticPrompt(criticInput('Formal', 'Event'));
assert(eventCritic.includes(OCCASION_CONTRACT.Event.geminiRules), '6: Event critic prompt uses Event rules');
const eventRevision = buildRevisionPrompt(revisionInput('Formal', 'formal event'));
assert(
  eventRevision.includes(OCCASION_CONTRACT.Event.geminiRules),
  '6: Event alias reaches revision through canonical event',
);

const nightOut = buildCriticContractContext('Streetwear', 'Night Out');
assert(nightOut.style?.label === 'Streetwear', '7: Night Out does not replace the requested style');
assert(nightOut.occasion?.label === 'Night Out', '7: Night Out is treated as an occasion');
assert(styleContractFor('Night Out') === null, '7: Night Out is not a style contract key');
assert(occasionContractFor('Night Out') !== null, '7: Night Out resolves as an occasion');
const nightOutCritic = buildCriticPrompt(criticInput('Streetwear', 'Night Out'));
assert(
  nightOutCritic.includes(OCCASION_CONTRACT['Night Out'].geminiRules),
  '7: Night Out critic prompt uses Night Out occasion contract',
);

let threw = false;
try {
  const missing = buildCriticContractContext('NotAStyle', 'NotAnOccasion');
  assert(missing.style === null, '8: missing style does not substitute another style');
  assert(missing.occasion === null, '9: missing occasion does not substitute another occasion');
  assert(missing.requested_style === 'NotAStyle', '8: missing style keeps the requested label');
  assert(missing.requested_occasion === 'NotAnOccasion', '9: missing occasion keeps the requested label');
  const missingCritic = buildCriticPrompt(criticInput('NotAStyle', 'NotAnOccasion'));
  const missingRevision = buildRevisionPrompt(revisionInput('NotAStyle', 'NotAnOccasion'));
  assert(missingCritic.includes('STYLE CONTRACT'), '8: missing criticInterpretation still builds a critic prompt');
  assert(missingCritic.includes('null'), '8: unresolved critic contract is emitted as null');
  assert(
    !missingCritic.includes(STYLE_CONTRACT.Streetwear.criticInterpretation),
    '8: missing style does not silently use Streetwear criticInterpretation',
  );
  assert(missingRevision.includes('OCCASION CONTRACT'), '9: missing occasion still builds a revision prompt');
  assert(
    !missingRevision.includes(OCCASION_CONTRACT.Everyday.geminiRules),
    '9: missing occasion does not silently use Everyday',
  );
} catch {
  threw = true;
}
assert(!threw, '8/9: missing criticInterpretation or occasion contract does not crash');

const noShoesCritic = buildCriticPrompt(
  criticInput('Minimalist', 'Everyday', { footwearPreference: 'none' }),
);
assert(noShoesCritic.includes('Footwear was intentionally excluded'), '10: No Shoes critic forbids recommending footwear');
assert(noShoesCritic.includes('Never recommend adding footwear'), '10: No Shoes critic never recommends adding footwear');
assert(noShoesCritic.includes('treat it as irrelevant'), '10: critic footwear mentions are irrelevant under No Shoes');
const noShoesRevision = buildRevisionPrompt(
  revisionInput('Minimalist', 'Everyday', { footwearPreference: 'none' }),
);
assert(noShoesRevision.includes('do not add shoes'), '10: No Shoes revision must not add shoes');
assert(noShoesRevision.includes('Set shoes_id to null'), '10: No Shoes revision keeps shoes_id null');
assert(
  noShoesRevision.includes('If the critic mentions footwear, treat it as irrelevant'),
  '10: revision ignores critic footwear under No Shoes',
);

function catalogRow(
  id: string,
  category: string,
  extras: Partial<CatalogLike> = {},
): CatalogLike {
  return {
    id,
    name: extras.name ?? id,
    brand: extras.brand ?? 'A',
    category,
    subcategory: extras.subcategory ?? null,
    color: extras.color ?? 'black',
    colors: extras.colors ?? ['black'],
    visual_attributes: extras.visual_attributes,
    ...extras,
  };
}

const usableVisual = { ...emptyVisualAttributes(0.9), primary_color: 'navy' };
const currentIds = ['t1', 'b1', 's1'];
const revisionPool: CatalogLike[] = [
  catalogRow('t1', 'top'),
  catalogRow('b1', 'bottom', { visual_attributes: usableVisual }),
  catalogRow('s1', 'shoes', { visual_attributes: usableVisual }),
  catalogRow('b-verified', 'bottom', { visual_attributes: usableVisual }),
  catalogRow('b-unverified', 'bottom'),
  catalogRow('old-top', 'top', { visual_attributes: usableVisual }),
  catalogRow('sneaky-shoes', 'shoes', { name: 'White Canvas Sneakers', visual_attributes: usableVisual }),
];

const filteredCatalog = revisionCatalogFromProducts(revisionPool, {
  keepProductIds: currentIds,
  excludeIds: ['old-top'],
  footwearPreference: 'include',
});
const filteredIds = filteredCatalog.map((row) => row.product_id);
assert(filteredIds.includes('t1'), '16: current outfit without visual stays in revision catalog');
assert(filteredIds.includes('b-verified'), '16: visually analyzed alternative is eligible');
assert(!filteredIds.includes('b-unverified'), '16: unverified visual swap is not offered');
assert(!filteredIds.includes('old-top'), '11: excluded product IDs stay out of revision catalog');
assert(
  parseFashionRevisionResult(
    JSON.stringify({ items: [{ product_id: 't1' }, { product_id: 'old-top' }, { product_id: 's1' }] }),
    new Set(filteredIds),
  ) === null,
  '11: excluded product IDs are rejected by revision parse',
);
assert(
  parseFashionRevisionResult(
    JSON.stringify({ items: [{ product_id: 't1' }, { product_id: 'b-unverified' }, { product_id: 's1' }] }),
    new Set(filteredIds),
  ) === null,
  '16: unverified visual swap cannot be selected',
);
assert(
  parseFashionRevisionResult(
    JSON.stringify({ items: [{ product_id: 't1' }, { product_id: 'b-verified' }, { product_id: 's1' }] }),
    new Set(filteredIds),
  )?.items[1].product_id === 'b-verified',
  '16: visually analyzed swap remains selectable',
);

const noShoesCatalog = revisionCatalogFromProducts(revisionPool, {
  keepProductIds: ['t1', 'b1'],
  footwearPreference: 'none',
});
assert(
  noShoesCatalog.every((row) => row.category !== 'shoes'),
  '10: No Shoes revision catalog contains no footwear rows',
);
assert(
  parseFashionRevisionResult(
    JSON.stringify({ items: [{ product_id: 't1' }, { product_id: 'b1' }, { product_id: 's1' }] }),
    new Set(noShoesCatalog.map((row) => row.product_id)),
    { requireShoes: false },
  ) === null,
  '10: No Shoes revision parse cannot introduce a shoe ID outside the catalog',
);

assert(MIN_REVISION_IMPROVEMENT === 2, '12: +2 acceptance threshold is unchanged');
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
  issues: [] as string[],
  suggestions: [] as string[],
};
assert(!shouldAcceptRevision(originalScore, { ...originalScore, score: 77 }), '12: +1 is still rejected');
assert(shouldAcceptRevision(originalScore, { ...originalScore, score: 78 }), '12: +2 is still accepted');
assert(
  !shouldAcceptRevision(originalScore, { ...originalScore, score: 76 }),
  '13: critic severity cannot accept a revision without score improvement',
);

type Built = { selected: Array<{ product: { id: string; category: string }; reason: string }>; totalPrice: number };
const revisionProducts = {
  t1: { id: 't1', category: 'top' },
  b1: { id: 'b1', category: 'bottom' },
  s1: { id: 's1', category: 'shoes' },
  b2: { id: 'b2', category: 'bottom' },
};

function fakeValidate(outfit: { items: Array<{ product_id: string; reason: string }> }): Built {
  const seen = new Set<string>();
  const selected: Built['selected'] = [];
  for (const item of outfit.items) {
    const next = revisionProducts[item.product_id as keyof typeof revisionProducts];
    if (!next) throw new Error('invalid_ai');
    if (seen.has(next.category)) throw new Error('invalid_ai');
    seen.add(next.category);
    selected.push({ product: next, reason: item.reason });
  }
  for (const required of ['top', 'bottom', 'shoes']) {
    if (!seen.has(required)) throw new Error('invalid_ai');
  }
  return { selected, totalPrice: 90 };
}

function mockProvider(revision: FashionRevisionResult | null): FashionAIProvider {
  return {
    name: 'mock',
    generateOutfits: async () => {
      throw new Error('not_implemented');
    },
    critiqueOutfit: async () => criticResult({ overall_assessment: 'strong' }),
    reviseOutfit: async () => revision,
  };
}

async function runApply(
  revision: FashionRevisionResult | null,
  extras: {
    validate?: typeof fakeValidate;
    score?: (products: Array<{ id: string; category: string }>) => typeof originalScore;
  } = {},
) {
  return applyOutfitRevision({
    critic: criticResult(),
    originalCriticRun: {
      fashion_critic_available: true,
      fashion_critic: criticResult(),
      image_count: 3,
    },
    original: {
      outfitName: 'Original',
      stylingTip: 'Original tip',
      items: [
        { product_id: 't1', reason: 'top' },
        { product_id: 'b1', reason: 'bottom' },
        { product_id: 's1', reason: 'shoes' },
      ],
      built: fakeValidate({
        items: [
          { product_id: 't1', reason: 'top' },
          { product_id: 'b1', reason: 'bottom' },
          { product_id: 's1', reason: 'shoes' },
        ],
      }),
      products: [revisionProducts.t1, revisionProducts.b1, revisionProducts.s1],
      fashion: originalScore,
    },
    revisionInput: revisionInput('Casual', 'Everyday'),
    provider: mockProvider(revision),
    validate: extras.validate ?? fakeValidate,
    productsOf: (built) => built.selected.map(({ product }) => product),
    score: extras.score ?? ((products) =>
      products.some((product) => product.id === 'b2')
        ? { ...originalScore, score: 78 }
        : originalScore),
    critique: async () => ({
      fashion_critic_available: true,
      fashion_critic: criticResult({ overall_assessment: 'strong' }),
      image_count: 3,
    }),
    criticInputFor: () => criticInput('Casual', 'Everyday'),
  });
}

async function main() {
  const noImprove = await runApply({
    items: [{ product_id: 't1' }, { product_id: 'b2' }, { product_id: 's1' }],
  }, { score: () => originalScore });
  assert(
    noImprove.revision.fashion_revision_accepted === false,
    '13: critic recommendation is not sufficient without deterministic score improvement',
  );
  assert(noImprove.fashion.score === 76, '13: original deterministic score is kept');

  const plusOne = await runApply(
    { items: [{ product_id: 't1' }, { product_id: 'b2' }, { product_id: 's1' }] },
    { score: () => ({ ...originalScore, score: 77 }) },
  );
  assert(plusOne.revision.fashion_revision_accepted === false, '12: +1 revision is still rejected');

  const plusTwo = await runApply({
    items: [{ product_id: 't1' }, { product_id: 'b2' }, { product_id: 's1' }],
  });
  assert(plusTwo.revision.fashion_revision_accepted === true, '12: +2 revision is still accepted');

  const invalid = await runApply({
    items: [{ product_id: 't1' }, { product_id: 'unknown' }, { product_id: 's1' }],
  });
  assert(invalid.revision.fashion_revision_accepted === false, '14: critic cannot bypass hard validation');
  assert(invalid.fashion.score === 76, '14: original outfit kept after validation failure');

  const budget = await runApply(
    { items: [{ product_id: 't1' }, { product_id: 'b2' }, { product_id: 's1' }] },
    { validate: () => { throw new Error('budget'); } },
  );
  assert(budget.revision.fashion_revision_accepted === false, '15: revision cannot bypass budget');
  assert(budget.revision.fashion_revision_reason === 'budget', '15: budget failure is recorded');

  const gender = await runApply(
    { items: [{ product_id: 't1' }, { product_id: 'b2' }, { product_id: 's1' }] },
    { validate: () => { throw new Error('invalid_ai'); } },
  );
  assert(gender.revision.fashion_revision_accepted === false, '15: revision cannot bypass gender/brand/category validation');

  const addedShoes = await runApply(
    { items: [{ product_id: 't1' }, { product_id: 'b2' }, { product_id: 's1' }] },
    {
      validate: (outfit) => {
        if (outfit.items.some((item) => item.product_id === 's1')) throw new Error('invalid_ai');
        return fakeValidate(outfit);
      },
    },
  );
  assert(addedShoes.revision.fashion_revision_accepted === false, '15: revision cannot bypass No Shoes validation');

  if (failed) {
    console.error(`\ncriticContractPrompt tests: ${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`criticContractPrompt tests: ${passed} passed`);
}

void main();
