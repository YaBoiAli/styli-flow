/**
 * Temporary local Phase 3 harness.
 *
 * Drives the real Phase 3 orchestrator (applyOutfitRevision) plus:
 *   shouldReviseCritic, shouldAcceptRevision, parseFashionRevisionResult,
 *   scoreOutfit, critiqueWinningOutfit
 *
 * Does NOT start generate-outfit, call Gemini, deploy, or touch production data.
 *
 * Boundary that blocks true HTTP/Gemini E2E locally:
 *   1. generate-outfit/index.ts calls Deno.serve() at import time, so
 *      validateAndBuild and the HTTP handler cannot be imported under tsx.
 *   2. GeminiFashionAIProvider uses Deno.env.get + live Gemini. Critic and
 *      revision text are non-deterministic, so the eight exact branches
 *      cannot be forced from a live model.
 *   3. npm run test:generate hits the deployed remote function, not this
 *      local un-deployed Phase 3 code.
 *
 * The only stub is FashionAIProvider I/O (scripted critic JSON / revision
 * JSON / throw). Decision logic is not mocked. Scores come from scoreOutfit
 * on catalog-shaped products. Revision JSON goes through
 * parseFashionRevisionResult, the same parse GeminiFashionAIProvider uses.
 *
 * Run: npx tsx supabase/functions/_shared/fashionAI/phase3Harness.ts
 */
import { scoreOutfit, type OutfitScore } from '../catalog/outfitScoring.ts';
import { applyOutfitRevision } from './applyOutfitRevision.ts';
import {
  criticProductsFromCatalog,
  revisionCatalogFromProducts,
  type CatalogLike,
} from './criticInput.ts';
import { critiqueWinningOutfit } from './critiqueWinningOutfit.ts';
import { parseFashionRevisionResult } from './parseFashionRevision.ts';
import { shouldAcceptRevision } from './revisionCompare.ts';
import { shouldReviseCritic } from './shouldReviseCritic.ts';
import type {
  FashionAIProvider,
  FashionCriticResult,
  FashionRevisionResult,
} from './types.ts';

type Category = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';

type HarnessProduct = CatalogLike & {
  id: string;
  category: Category;
  price: number;
  color: string;
  colors: string[];
  subcategory: string | null;
  material: string | null;
  description: string | null;
  fit: string | null;
  silhouette: string | null;
  pattern: string | null;
  formality: string | null;
  style_tags: string[];
  aesthetic_tags: string[];
  occasion_tags: string[];
  season_tags: string[];
};

type Built = {
  selected: Array<{ product: HarnessProduct; reason: string }>;
  totalPrice: number;
};

const REQUIRED: Category[] = ['top', 'bottom', 'shoes'];
const OPTIONAL: Category[] = ['outerwear', 'accessory'];
const BUDGET = { outfit: 200, shoes: null as number | null };
const CONTEXT = { style: 'Streetwear', occasion: 'Everyday' as const };

function product(
  partial: Omit<HarnessProduct, 'brand' | 'image_url' | 'price' | 'description'> &
    Partial<Pick<HarnessProduct, 'brand' | 'image_url' | 'price' | 'description'>>,
): HarnessProduct {
  return {
    brand: 'Harness',
    image_url: `https://cdn.example.com/${partial.id}.jpg`,
    price: 20,
    description: null,
    ...partial,
  };
}

const catalog: Record<string, HarnessProduct> = {
  'top-oversized': product({
    id: 'top-oversized',
    name: 'Oversized Graphic Tee',
    category: 'top',
    subcategory: 't-shirt',
    color: 'black',
    colors: ['black'],
    material: null,
    fit: 'oversized',
    silhouette: 'oversized',
    pattern: 'graphic',
    formality: 'casual',
    style_tags: ['streetwear'],
    aesthetic_tags: ['streetwear'],
    occasion_tags: ['everyday'],
    season_tags: ['all_season'],
  }),
  'bottom-baggy': product({
    id: 'bottom-baggy',
    name: 'Baggy Black Cargo Pants',
    category: 'bottom',
    subcategory: 'pants',
    color: 'black',
    colors: ['black'],
    material: null,
    fit: 'loose',
    silhouette: 'baggy',
    pattern: null,
    formality: 'casual',
    style_tags: ['streetwear'],
    aesthetic_tags: [],
    occasion_tags: ['everyday'],
    season_tags: ['all_season'],
  }),
  'shoes-running': product({
    id: 'shoes-running',
    name: 'Running Trainers',
    category: 'shoes',
    subcategory: 'sneakers',
    color: 'white',
    colors: ['white'],
    material: null,
    fit: null,
    silhouette: null,
    pattern: null,
    formality: 'athletic',
    style_tags: ['athleisure'],
    aesthetic_tags: [],
    occasion_tags: ['everyday'],
    season_tags: ['all_season'],
  }),
  'bottom-straight': product({
    id: 'bottom-straight',
    name: 'Straight Black Trousers',
    category: 'bottom',
    subcategory: 'pants',
    color: 'black',
    colors: ['black'],
    material: null,
    fit: 'regular',
    silhouette: 'straight',
    pattern: null,
    formality: 'casual',
    style_tags: ['streetwear', 'minimalist'],
    aesthetic_tags: [],
    occasion_tags: ['everyday'],
    season_tags: ['all_season'],
  }),
  'shoes-white': product({
    id: 'shoes-white',
    name: 'White Canvas Sneakers',
    category: 'shoes',
    subcategory: 'sneakers',
    color: 'white',
    colors: ['white'],
    material: 'canvas',
    fit: 'regular',
    silhouette: 'regular',
    pattern: null,
    formality: 'casual',
    style_tags: ['casual', 'streetwear'],
    aesthetic_tags: [],
    occasion_tags: ['everyday'],
    season_tags: ['all_season'],
  }),
  'top-black-tee': product({
    id: 'top-black-tee',
    name: 'Black Cotton Tee',
    category: 'top',
    subcategory: 't-shirt',
    color: 'black',
    colors: ['black'],
    material: 'cotton',
    fit: 'regular',
    silhouette: 'regular',
    pattern: 'solid',
    formality: 'casual',
    style_tags: ['casual', 'streetwear'],
    aesthetic_tags: ['streetwear'],
    occasion_tags: ['everyday'],
    season_tags: ['all_season'],
  }),
  'bottom-formal': product({
    id: 'bottom-formal',
    name: 'Formal Wool Trousers',
    category: 'bottom',
    subcategory: 'pants',
    color: 'charcoal',
    colors: ['charcoal'],
    material: 'wool',
    fit: 'slim',
    silhouette: 'straight',
    pattern: null,
    formality: 'formal',
    style_tags: ['formal', 'old_money'],
    aesthetic_tags: [],
    occasion_tags: ['work', 'event'],
    season_tags: ['fall', 'winter'],
  }),
  'shoes-loafers': product({
    id: 'shoes-loafers',
    name: 'Black Leather Dress Loafers',
    category: 'shoes',
    subcategory: 'loafers',
    color: 'black',
    colors: ['black'],
    material: 'leather',
    fit: null,
    silhouette: null,
    pattern: null,
    formality: 'formal',
    style_tags: ['old_money', 'formal'],
    aesthetic_tags: [],
    occasion_tags: ['work', 'event'],
    season_tags: ['all_season'],
  }),
};

const ORIGINAL_IDS = ['top-oversized', 'bottom-baggy', 'shoes-running'] as const;
const PLUS_TWO_IDS = ['top-oversized', 'bottom-straight', 'shoes-white'] as const;
const PLUS_ONE_IDS = ['top-black-tee', 'bottom-baggy', 'shoes-white'] as const;
const EQUAL_IDS = ['top-oversized', 'bottom-straight', 'shoes-running'] as const;
const LOWER_IDS = ['top-oversized', 'bottom-formal', 'shoes-loafers'] as const;
const INVALID_IDS = ['top-oversized', 'ghost-product', 'shoes-running'] as const;

function idsOf(ids: readonly string[]): HarnessProduct[] {
  return ids.map((id) => {
    const found = catalog[id];
    if (!found) throw new Error(`missing catalog product ${id}`);
    return found;
  });
}

/**
 * Same hard legality as generate-outfit validateAndBuild (IDs, unique
 * categories, required slots, budget). Copied because index.ts is not
 * importable without Deno.serve().
 */
function validateAndBuildLocal(outfit: {
  outfit_name: string;
  styling_tip: string;
  items: Array<{ product_id: string; reason: string }>;
}): Built {
  const selected: Built['selected'] = [];
  const seen = new Set<Category>();
  for (const item of outfit.items) {
    const found = catalog[item.product_id];
    if (!found) throw new Error('invalid_ai');
    if (seen.has(found.category)) throw new Error('invalid_ai');
    seen.add(found.category);
    selected.push({ product: found, reason: item.reason || 'Selected for this fit.' });
  }
  for (const required of REQUIRED) {
    if (!seen.has(required)) throw new Error('invalid_ai');
  }
  for (const category of seen) {
    if (!REQUIRED.includes(category) && !OPTIONAL.includes(category)) {
      throw new Error('invalid_ai');
    }
  }
  const total = selected.reduce((sum, entry) => sum + entry.product.price, 0);
  const totalPrice = Math.round(total * 100) / 100;
  if (totalPrice > BUDGET.outfit) throw new Error('budget');
  return { selected, totalPrice };
}

function criticOf(partial: Partial<FashionCriticResult>): FashionCriticResult {
  return {
    overall_assessment: 'acceptable',
    style_match: 8,
    color_harmony: 8,
    proportion: 8,
    occasion_match: 8,
    cohesion: 8,
    strengths: ['Clean street palette'],
    issues: [],
    recommendations: [],
    ...partial,
  };
}

const STRONG_CRITIC = criticOf({
  overall_assessment: 'strong',
  style_match: 9,
  color_harmony: 9,
  proportion: 8,
  occasion_match: 9,
  cohesion: 9,
  strengths: ['Cohesive streetwear set'],
});

const MAJOR_CRITIC = criticOf({
  overall_assessment: 'acceptable',
  style_match: 7,
  color_harmony: 6,
  proportion: 6,
  issues: [{ type: 'proportion', severity: 'major', product_id: 'bottom-baggy' }],
  recommendations: ['Swap the baggy cargo for a cleaner straight pant'],
});

function revisionJson(ids: readonly string[]): string {
  return JSON.stringify({
    items: ids.map((product_id) => ({
      product_id,
      reason: `Harness revision to ${product_id}`,
    })),
    outfit_name: 'Revised street set',
    styling_tip: 'Keep the graphic tee; change only the weak piece.',
  });
}

function formatIds(ids: readonly string[] | null): string {
  return ids?.length ? ids.join(', ') : '(none)';
}

function formatScore(score: number | null): string {
  return score === null ? '(n/a — revision never scored)' : String(score);
}

function formatCritic(critic: FashionCriticResult): string {
  const issues = critic.issues.length
    ? critic.issues.map((issue) => `${issue.severity} ${issue.type}${issue.product_id ? `:${issue.product_id}` : ''}`).join('; ')
    : 'none';
  return `${critic.overall_assessment} (style=${critic.style_match} color=${critic.color_harmony} proportion=${critic.proportion} occasion=${critic.occasion_match} cohesion=${critic.cohesion}; issues: ${issues})`;
}

type Scenario = {
  title: string;
  critic: FashionCriticResult;
  revision: string | 'throw' | null;
  expectAttempted: boolean;
  expectAccepted: boolean;
};

const scenarios: Scenario[] = [
  {
    title: '1. Strong critic → no revision',
    critic: STRONG_CRITIC,
    revision: revisionJson(PLUS_TWO_IDS),
    expectAttempted: false,
    expectAccepted: false,
  },
  {
    title: '2. Major critic issue → revision attempted',
    critic: MAJOR_CRITIC,
    revision: revisionJson(EQUAL_IDS),
    expectAttempted: true,
    expectAccepted: false,
  },
  {
    title: '3. Valid revision with score +2 or more → revision accepted',
    critic: MAJOR_CRITIC,
    revision: revisionJson(PLUS_TWO_IDS),
    expectAttempted: true,
    expectAccepted: true,
  },
  {
    title: '4. Valid revision with score +1 → revision rejected',
    critic: MAJOR_CRITIC,
    revision: revisionJson(PLUS_ONE_IDS),
    expectAttempted: true,
    expectAccepted: false,
  },
  {
    title: '5. Valid revision with equal score → revision rejected',
    critic: MAJOR_CRITIC,
    revision: revisionJson(EQUAL_IDS),
    expectAttempted: true,
    expectAccepted: false,
  },
  {
    title: '6. Valid revision with lower score → revision rejected',
    critic: MAJOR_CRITIC,
    revision: revisionJson(LOWER_IDS),
    expectAttempted: true,
    expectAccepted: false,
  },
  {
    title: '7. Invalid revision product ID → original retained',
    critic: MAJOR_CRITIC,
    revision: revisionJson(INVALID_IDS),
    expectAttempted: true,
    expectAccepted: false,
  },
  {
    title: '8. Revision provider failure → original retained',
    critic: MAJOR_CRITIC,
    revision: 'throw',
    expectAttempted: true,
    expectAccepted: false,
  },
];

function proposedIds(revision: string | 'throw' | null): string[] | null {
  if (!revision || revision === 'throw') return null;
  try {
    const parsed = JSON.parse(revision) as { items?: Array<{ product_id?: string }> };
    return parsed.items?.map((item) => item.product_id ?? '') ?? null;
  } catch {
    return null;
  }
}

async function runScenario(scenario: Scenario) {
  const originalProducts = idsOf(ORIGINAL_IDS);
  const originalItems = originalProducts.map((entry) => ({
    product_id: entry.id,
    reason: `Original ${entry.category}`,
  }));
  const originalBuilt = validateAndBuildLocal({
    outfit_name: 'Original street set',
    styling_tip: 'Stacked graphic tee and cargo.',
    items: originalItems,
  });
  const originalFashion = scoreOutfit(originalProducts, CONTEXT);

  const counts = { critic: 0, revision: 0 };
  let lastScored: OutfitScore | null = null;
  let parsedRevision: FashionRevisionResult | null = null;

  const provider: FashionAIProvider = {
    name: 'phase3-harness',
    generateOutfits: async () => {
      throw new Error('not_used');
    },
    critiqueOutfit: async () => {
      counts.critic += 1;
      return counts.critic === 1 ? scenario.critic : STRONG_CRITIC;
    },
    reviseOutfit: async (input) => {
      counts.revision += 1;
      if (scenario.revision === 'throw') throw new Error('provider_error');
      if (!scenario.revision) return null;
      const allowed = new Set(input.catalog.map((entry) => entry.product_id));
      parsedRevision = parseFashionRevisionResult(scenario.revision, allowed);
      return parsedRevision;
    },
  };

  const criticInput = {
    style: CONTEXT.style,
    occasion: CONTEXT.occasion,
    season: 'all_season' as const,
    products: criticProductsFromCatalog(originalProducts),
  };
  const originalCriticRun = await critiqueWinningOutfit(criticInput, provider);

  const result = await applyOutfitRevision({
    critic: originalCriticRun.fashion_critic,
    originalCriticRun,
    original: {
      outfitName: 'Original street set',
      stylingTip: 'Stacked graphic tee and cargo.',
      items: originalItems,
      built: originalBuilt,
      products: originalProducts,
      fashion: originalFashion,
    },
    revisionInput: {
      style: CONTEXT.style,
      occasion: CONTEXT.occasion,
      season: 'all_season',
      currentOutfit: criticInput.products,
      critic: originalCriticRun.fashion_critic ?? scenario.critic,
      catalog: revisionCatalogFromProducts(Object.values(catalog)),
    },
    provider,
    validate: validateAndBuildLocal,
    productsOf: (built) => built.selected.map(({ product: entry }) => entry),
    score: (products) => {
      lastScored = scoreOutfit(products, CONTEXT);
      return lastScored;
    },
    critique: (input) => critiqueWinningOutfit(input, provider),
    criticInputFor: (products) => ({
      style: CONTEXT.style,
      occasion: CONTEXT.occasion,
      season: 'all_season',
      products: criticProductsFromCatalog(products),
    }),
  });

  const attempted = result.revision.fashion_revision_attempted;
  const accepted = result.revision.fashion_revision_accepted;
  const revisedIds = parsedRevision?.items.map((item) => item.product_id)
    ?? (attempted ? proposedIds(scenario.revision) : null);
  const revisedScore = lastScored?.score ?? null;
  const finalIds = result.items.map((item) => item.product_id);

  const lines = [
    `=== ${scenario.title} ===`,
    `original product IDs:     ${formatIds(ORIGINAL_IDS)}`,
    `original fashion_score:   ${originalFashion.score}`,
    `critic assessment:        ${formatCritic(scenario.critic)}`,
    `whether revision attempted: ${attempted}`,
    `revised product IDs:      ${formatIds(revisedIds)}`,
    `revised fashion_score:    ${formatScore(revisedScore)}`,
    `whether revision accepted: ${accepted}`,
    `final product IDs:        ${formatIds(finalIds)}`,
    `final fashion_score:      ${result.fashion.score}`,
    `number of critic calls:   ${counts.critic}`,
    `number of revision calls: ${counts.revision}`,
    `revision reason:          ${result.revision.fashion_revision_reason ?? '(none)'}`,
    `shouldReviseCritic:       ${shouldReviseCritic(scenario.critic)}`,
    `applyOutfitRevision criticCalls: ${result.criticCalls}`,
  ];
  if (revisedScore !== null) {
    lines.push(
      `shouldAcceptRevision:     ${shouldAcceptRevision(originalFashion, lastScored!)} (delta ${revisedScore - originalFashion.score})`,
    );
  }
  console.log(`\n${lines.join('\n')}`);

  const failures: string[] = [];
  if (attempted !== scenario.expectAttempted) {
    failures.push(`expected attempted=${scenario.expectAttempted}, got ${attempted}`);
  }
  if (accepted !== scenario.expectAccepted) {
    failures.push(`expected accepted=${scenario.expectAccepted}, got ${accepted}`);
  }
  if (ORIGINAL_IDS.join() !== originalProducts.map((entry) => entry.id).join()) {
    failures.push('original IDs drifted');
  }
  if (!accepted && finalIds.join() !== ORIGINAL_IDS.join()) {
    failures.push(`rejected revision must keep original IDs, got ${finalIds.join(', ')}`);
  }
  if (!accepted && result.fashion.score !== originalFashion.score) {
    failures.push('rejected revision must keep original fashion_score');
  }
  if (accepted && finalIds.join() === ORIGINAL_IDS.join()) {
    failures.push('accepted revision should change the outfit');
  }
  if (scenario.title.startsWith('3.') && (revisedScore === null || revisedScore < originalFashion.score + 2)) {
    failures.push(`expected real scoreOutfit delta >= +2, got ${revisedScore}`);
  }
  if (scenario.title.startsWith('4.') && revisedScore !== originalFashion.score + 1) {
    failures.push(`expected real scoreOutfit delta +1, got ${revisedScore}`);
  }
  if (scenario.title.startsWith('5.') && revisedScore !== originalFashion.score) {
    failures.push(`expected real scoreOutfit equal scores, got ${revisedScore}`);
  }
  if (scenario.title.startsWith('6.') && (revisedScore === null || revisedScore >= originalFashion.score)) {
    failures.push(`expected real scoreOutfit lower score, got ${revisedScore}`);
  }
  if (scenario.title.startsWith('7.') && parsedRevision !== null) {
    failures.push('invalid product ID should fail parseFashionRevisionResult');
  }
  if (scenario.expectAttempted && counts.revision !== 1) {
    failures.push(`expected 1 revision call, got ${counts.revision}`);
  }
  if (!scenario.expectAttempted && counts.revision !== 0) {
    failures.push(`expected 0 revision calls, got ${counts.revision}`);
  }
  if (accepted && counts.critic !== 2) {
    failures.push(`accepted revision should re-critique (2 critic calls), got ${counts.critic}`);
  }
  if (!accepted && counts.critic !== 1) {
    failures.push(`rejected/skipped revision should keep 1 critic call, got ${counts.critic}`);
  }
  return failures;
}

async function main() {
  console.log(`Phase 3 local harness
=======================
True HTTP + Gemini end-to-end is not available locally without deploying.
This run uses applyOutfitRevision / shouldReviseCritic / shouldAcceptRevision /
parseFashionRevisionResult / scoreOutfit / critiqueWinningOutfit.
FashionAIProvider is scripted only at the Gemini I/O boundary.
validateAndBuild is a local copy of the generate-outfit legality rules
because index.ts cannot be imported without Deno.serve().
`);

  const originalScore = scoreOutfit(idsOf(ORIGINAL_IDS), CONTEXT).score;
  const plusTwo = scoreOutfit(idsOf(PLUS_TWO_IDS), CONTEXT).score;
  const plusOne = scoreOutfit(idsOf(PLUS_ONE_IDS), CONTEXT).score;
  const equal = scoreOutfit(idsOf(EQUAL_IDS), CONTEXT).score;
  const lower = scoreOutfit(idsOf(LOWER_IDS), CONTEXT).score;
  console.log('scoreOutfit fixtures (Streetwear / Everyday):');
  console.log(`  original ${ORIGINAL_IDS.join(', ')} = ${originalScore}`);
  console.log(`  +2       ${PLUS_TWO_IDS.join(', ')} = ${plusTwo} (delta ${plusTwo - originalScore})`);
  console.log(`  +1       ${PLUS_ONE_IDS.join(', ')} = ${plusOne} (delta ${plusOne - originalScore})`);
  console.log(`  equal    ${EQUAL_IDS.join(', ')} = ${equal} (delta ${equal - originalScore})`);
  console.log(`  lower    ${LOWER_IDS.join(', ')} = ${lower} (delta ${lower - originalScore})`);

  const allFailures: string[] = [];
  for (const scenario of scenarios) {
    const failures = await runScenario(scenario);
    if (failures.length) {
      for (const failure of failures) {
        console.error(`  FAIL: ${failure}`);
        allFailures.push(`${scenario.title}: ${failure}`);
      }
    } else {
      console.log('  OK');
    }
  }

  if (allFailures.length) {
    console.error(`\n${allFailures.length} harness check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll 8 Phase 3 harness scenarios passed.');
}

void main();
