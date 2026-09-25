/**
 * Phase 2B: visual critic parse + advisory attach. Selection score is unchanged.
 * Run: npm run test:outfit-score
 */
import { toFashionResponseFields } from '../../generate-outfit/attachFashionScore.ts';
import { criticImageUrls, criticProductsFromCatalog } from './criticInput.ts';
import { critiqueWinningOutfit } from './critiqueWinningOutfit.ts';
import { parseFashionCriticResult } from './parseFashionCritic.ts';
import type { FashionAIProvider, FashionCriticInput, FashionCriticResult } from './types.ts';

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

const validJson = JSON.stringify({
  overall_assessment: 'strong',
  style_match: 9,
  color_harmony: 8,
  proportion: 9,
  occasion_match: 9,
  cohesion: 8,
  strengths: ['Balanced palette', 'Footwear matches the vibe'],
  issues: [{ type: 'color', severity: 'minor', product_id: 'top-1' }],
  recommendations: ['Keep the black pants as the base'],
});

const parsed = parseFashionCriticResult(validJson, ['top-1', 'bottom-1', 'shoes-1']);
assert(parsed?.overall_assessment === 'strong', 'TEST 1: valid critic response parses');
assert(parsed?.style_match === 9 && parsed?.color_harmony === 8, 'TEST 1: scores preserved');

assert(
  parseFashionCriticResult(
    JSON.stringify({ ...JSON.parse(validJson), overall_assessment: 'amazing' }),
    ['top-1'],
  ) === null,
  'TEST 2: invalid overall_assessment rejected',
);

assert(
  parseFashionCriticResult(
    JSON.stringify({ ...JSON.parse(validJson), style_match: 0 }),
    ['top-1'],
  ) === null,
  'TEST 3: score below 1 rejected',
);

assert(
  parseFashionCriticResult(
    JSON.stringify({ ...JSON.parse(validJson), cohesion: 11 }),
    ['top-1'],
  ) === null,
  'TEST 4: score above 10 rejected',
);

assert(parseFashionCriticResult('{not-json', ['top-1']) === null, 'TEST 5: malformed JSON rejected');

const withKnown = parseFashionCriticResult(validJson, ['top-1', 'bottom-1']);
assert(withKnown?.issues[0]?.product_id === 'top-1', 'TEST 6: known product_id kept');

const unknownSanitized = parseFashionCriticResult(
  JSON.stringify({
    ...JSON.parse(validJson),
    issues: [{ type: 'color', severity: 'minor', product_id: 'not-in-outfit' }],
  }),
  ['top-1', 'bottom-1'],
);
assert(
  unknownSanitized?.issues[0] && unknownSanitized.issues[0].product_id === undefined,
  'TEST 7: unknown product_id sanitized off the issue',
);

const mixedImages = criticProductsFromCatalog([
  {
    id: 'top-1',
    name: 'Tee',
    brand: 'A',
    category: 'top',
    image_url: 'https://cdn.example.com/tee.jpg',
  },
  {
    id: 'bottom-1',
    name: 'Jeans',
    brand: 'A',
    category: 'bottom',
    image_url: '',
  },
  {
    id: 'shoes-1',
    name: 'Sneakers',
    brand: 'A',
    category: 'shoes',
    image_url: 'not-a-url',
  },
]);
assert(mixedImages[0].image_available === true, 'TEST 8: valid image kept');
assert(mixedImages[1].image_available === false, 'TEST 8: missing image does not crash');
assert(mixedImages[2].image_available === false, 'TEST 8: invalid image skipped');

const noImagesInput: FashionCriticInput = {
  style: 'Casual',
  occasion: 'Everyday',
  products: criticProductsFromCatalog([
    { id: 'top-1', name: 'Tee', brand: 'A', category: 'top', image_url: '' },
    { id: 'bottom-1', name: 'Jeans', brand: 'A', category: 'bottom' },
    { id: 'shoes-1', name: 'Sneakers', brand: 'A', category: 'shoes', image_url: 'ftp://x' },
  ]),
};

async function main() {
let providerCalls = 0;
const trackingProvider: FashionAIProvider = {
  name: 'mock',
  generateOutfits: async () => {
    throw new Error('not_implemented');
  },
  reviseOutfit: async () => null,
  critiqueOutfit: async (input) => {
    providerCalls += 1;
    const urls = criticImageUrls(input.products);
    assert(
      urls.length === 2 &&
        urls.every((url) => url.startsWith('https://cdn.example.com/')) &&
        !urls.includes('https://other.example.com/unused.jpg'),
      'TEST 14: only selected outfit images are passed',
    );
    return parseFashionCriticResult(validJson, input.products.map((product) => product.product_id));
  },
};

const skipped = await critiqueWinningOutfit(noImagesInput, trackingProvider);
assert(skipped.fashion_critic_available === false, 'TEST 9: no usable images skips critic');
assert(skipped.reason === 'no_images', 'TEST 9: skip reason is no_images');
assert(providerCalls === 0, 'TEST 9: provider is not called when images are missing');

const failingProvider: FashionAIProvider = {
  name: 'fail',
  generateOutfits: async () => {
    throw new Error('not_implemented');
  },
  reviseOutfit: async () => null,
  critiqueOutfit: async () => {
    throw new Error('provider_error');
  },
};

const fashion = {
  score: 86,
  breakdown: {
    style: 80,
    color: 90,
    proportion: 85,
    skinTone: 70,
    occasion: 80,
    fit: 70,
    season: 70,
    cohesion: 88,
  },
  issues: ['none'],
  suggestions: [],
};
const scoreFields = toFashionResponseFields(fashion);

const failedRun = await critiqueWinningOutfit(
  {
    style: 'Casual',
    occasion: 'Everyday',
    products: criticProductsFromCatalog([
      {
        id: 'top-1',
        name: 'Tee',
        brand: 'A',
        category: 'top',
        image_url: 'https://cdn.example.com/tee.jpg',
      },
    ]),
  },
  failingProvider,
);
const afterFailure = {
  ...scoreFields,
  fashion_critic_available: failedRun.fashion_critic_available,
  fashion_critic: failedRun.fashion_critic,
  outfit_name: 'Kept',
};
assert(failedRun.fashion_critic_available === false, 'TEST 10: provider failure does not throw');
assert(afterFailure.fashion_score === 86, 'TEST 10 / 11: fashion_score unchanged after critic failure');
assert(afterFailure.outfit_name === 'Kept', 'TEST 10: outfit still returned');

const winnerInput: FashionCriticInput = {
  style: 'Casual',
  occasion: 'Everyday',
  products: criticProductsFromCatalog([
    {
      id: 'top-1',
      name: 'Tee',
      brand: 'A',
      category: 'top',
      image_url: 'https://cdn.example.com/tee.jpg',
    },
    {
      id: 'bottom-1',
      name: 'Jeans',
      brand: 'A',
      category: 'bottom',
      image_url: 'https://cdn.example.com/jeans.jpg',
    },
    {
      id: 'unused',
      name: 'Not selected conceptually',
      brand: 'A',
      category: 'outerwear',
      image_url: 'https://cdn.example.com/tee.jpg',
    },
  ]),
};
const okRun = await critiqueWinningOutfit(winnerInput, trackingProvider);
const attached = {
  ...scoreFields,
  ...{
    fashion_critic_available: okRun.fashion_critic_available,
    fashion_critic: okRun.fashion_critic,
  },
};
assert(okRun.fashion_critic_available === true, 'TEST 11: critic attaches when available');
assert(attached.fashion_score === 86, 'TEST 11: fashion_score not replaced by critic');
assert(attached.fashion_breakdown.cohesion === 88, 'TEST 12: fashion_breakdown unchanged');
assert(attached.fashion_issues[0] === 'none', 'TEST 12: fashion_issues unchanged');
assert(Array.isArray(attached.fashion_suggestions), 'TEST 12: fashion_suggestions unchanged');
assert(providerCalls === 1, 'TEST 13: only one critic request for the winner');
assert(okRun.image_count === 2, 'TEST 14: duplicate image URL is not sent twice');

const _typeCheck: FashionCriticResult | undefined = okRun.fashion_critic;

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);
}

void main();
