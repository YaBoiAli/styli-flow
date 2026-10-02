/**
 * Query-matrix assertions for the UI style/occasion contract.
 * Live path: generateSearchQueries(intent, LIVE_STRATEGY_LIMITS.maxQueries)
 * per liveRetrievalCategories(footwearPreference).
 *
 * Run: npm run test:search-strategy
 */
import { OCCASIONS, STYLES, type Occasion, type Style } from '../../../../../types/index.ts';
import { liveRetrievalCategories } from '../../../generate-outfit/footwearPreference.ts';
import { LIVE_STRATEGY_LIMITS } from '../../../generate-outfit/liveRetrieval.ts';
import {
  OCCASION_CONTRACT,
  STYLE_CONTRACT,
  occasionRetrievalConcepts,
  styleRetrievalConcepts,
} from '../styleOccasionContract.ts';
import type { ProductCategory, ProductGender } from '../types.ts';
import {
  MAX_STYLE_QUERY_CONCEPTS,
  RESERVED_OCCASION_QUERY_SLOTS,
  generateSearchQueries,
} from './queries.ts';
import type { SearchOccasion, SearchQuery, SearchStyle } from './types.ts';
import { STYLE_CONCEPTS, conceptAllowed, normalizeIntentKey } from './vocabulary.ts';

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

const GENDERS: ProductGender[] = ['men', 'women'];
const SHOES: Array<'include' | 'none'> = ['include', 'none'];

type QueryMatrixRow = {
  style: Style;
  occasion: Occasion;
  gender: ProductGender;
  shoes: 'include' | 'none';
  queries: Array<{
    text: string;
    source: SearchQuery['source'];
    category: ProductCategory | undefined;
  }>;
  queryCount: number;
  hasShoeQueries: boolean;
  hasOccasionQueries: boolean;
  styleQueryCount: number;
  occasionQueryCount: number;
  categoryQueryCount: number;
};

function liveQueriesFor(
  style: Style,
  occasion: Occasion,
  gender: ProductGender,
  shoes: 'include' | 'none',
): QueryMatrixRow {
  const categories = liveRetrievalCategories(shoes);
  const queries: QueryMatrixRow['queries'] = [];
  for (const category of categories) {
    const generated = generateSearchQueries(
      { style, occasion, category, gender },
      LIVE_STRATEGY_LIMITS.maxQueries,
    );
    for (const query of generated) {
      queries.push({
        text: query.text,
        source: query.source,
        category: query.category,
      });
    }
  }
  return {
    style,
    occasion,
    gender,
    shoes,
    queries,
    queryCount: queries.length,
    hasShoeQueries: queries.some((query) => query.category === 'shoes'),
    hasOccasionQueries: queries.some((query) => query.source === 'occasion'),
    styleQueryCount: queries.filter((query) => query.source === 'style').length,
    occasionQueryCount: queries.filter((query) => query.source === 'occasion').length,
    categoryQueryCount: queries.filter((query) => query.source === 'category').length,
  };
}

function buildQueryMatrix(): QueryMatrixRow[] {
  const rows: QueryMatrixRow[] = [];
  for (const style of STYLES) {
    for (const occasion of OCCASIONS) {
      for (const gender of GENDERS) {
        for (const shoes of SHOES) {
          rows.push(liveQueriesFor(style, occasion, gender, shoes));
        }
      }
    }
  }
  return rows;
}

function formatCombo(row: QueryMatrixRow): string {
  const styleQueries = row.queries.filter((query) => query.source === 'style');
  const occasionQueries = row.queries.filter((query) => query.source === 'occasion');
  const categoryQueries = row.queries.filter((query) => query.source === 'category');
  const lines = [
    `STYLE: ${row.style}`,
    `OCCASION: ${row.occasion}`,
    `GENDER: ${row.gender}`,
    `SHOES: ${row.shoes}`,
    '',
    `query count: ${row.queryCount}`,
    `has occasion queries: ${row.hasOccasionQueries}`,
    `has shoe queries: ${row.hasShoeQueries}`,
    '',
    'STYLE QUERIES:',
    ...(styleQueries.length ? styleQueries.map((query) => `- [${query.category}] ${query.text}`) : ['(none)']),
    '',
    'OCCASION QUERIES:',
    ...(occasionQueries.length
      ? occasionQueries.map((query) => `- [${query.category}] ${query.text}`)
      : ['(none)']),
    '',
    'CATEGORY QUERIES:',
    ...(categoryQueries.length
      ? categoryQueries.map((query) => `- [${query.category}] ${query.text}`)
      : ['(none)']),
    '',
    'FINAL QUERIES:',
    ...row.queries.map((query) => `- ${query.source} [${query.category}] ${query.text}`),
  ];
  return lines.join('\n');
}

function requireRow(
  matrix: QueryMatrixRow[],
  style: Style,
  occasion: Occasion,
  gender: ProductGender,
  shoes: 'include' | 'none',
): QueryMatrixRow {
  const row = matrix.find(
    (entry) =>
      entry.style === style &&
      entry.occasion === occasion &&
      entry.gender === gender &&
      entry.shoes === shoes,
  );
  if (!row) {
    throw new Error(`missing matrix row ${style}|${occasion}|${gender}|${shoes}`);
  }
  return row;
}

function occasionQueriesFor(row: QueryMatrixRow, category: ProductCategory): number {
  return row.queries.filter((query) => query.source === 'occasion' && query.category === category).length;
}

function dumpOnFail(ok: boolean, row: QueryMatrixRow, message: string): void {
  if (ok) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${message}`);
  console.error(formatCombo(row));
}

const uiStyles = STYLES satisfies SearchStyle[];
const uiOccasions = OCCASIONS satisfies SearchOccasion[];

assert(uiStyles.length === 14, 'UI STYLES has 14 entries');
assert(uiOccasions.length === 8, 'UI OCCASIONS has 8 entries');
assert(LIVE_STRATEGY_LIMITS.maxQueries === 5, 'live maxQueries is still 5');
assert(LIVE_STRATEGY_LIMITS.perQueryLimit === 8, 'no Channel3 per-query limit increase');
assert(RESERVED_OCCASION_QUERY_SLOTS === 2, 'occasion reservation is 2 slots');
assert(MAX_STYLE_QUERY_CONCEPTS === 5, 'style concept pick cap is unchanged at 5');

for (const style of STYLES) {
  assert(STYLE_CONTRACT[style].label === style, `contract has UI style ${style}`);
  assert(styleRetrievalConcepts(style).length > 0, `${style} has retrieval concepts`);
}
for (const occasion of OCCASIONS) {
  assert(OCCASION_CONTRACT[occasion].label === occasion, `contract has UI occasion ${occasion}`);
  assert(occasionRetrievalConcepts(occasion).length > 0, `${occasion} has retrieval concepts`);
}
assert(OCCASION_CONTRACT.Event.key === 'event', 'Event canonical key is event');
assert(OCCASION_CONTRACT.Event.aliases.includes('formal event'), 'formal event is an Event alias only');
assert(!('Night Out' in STYLE_CONTRACT), 'Night Out is not a UI style record');
assert(!(normalizeIntentKey('Night Out') in STYLE_CONCEPTS), 'Night Out is not a style retrieval key');

const matrix = buildQueryMatrix();
assert(matrix.length === STYLES.length * OCCASIONS.length * GENDERS.length * SHOES.length, 'matrix covers every UI combo');

const noShoesWithShoeQueries = matrix.filter((row) => row.shoes === 'none' && row.hasShoeQueries);
assert(noShoesWithShoeQueries.length === 0, 'no-shoes produces zero shoe-category queries');

const eventWithoutOccasion = matrix.filter((row) => row.occasion === 'Event' && !row.hasOccasionQueries);
assert(eventWithoutOccasion.length === 0, 'every Event combination has at least one occasion query');

for (const style of ['Quiet Luxury', 'Dark Academia', 'Elevated Streetwear'] as const) {
  const missing = matrix.filter((row) => row.style === style && row.styleQueryCount === 0);
  assert(missing.length === 0, `${style} has style-sourced queries`);
}

const y2kPartyMenInclude = requireRow(matrix, 'Y2K', 'Party', 'men', 'include');
dumpOnFail(y2kPartyMenInclude.hasOccasionQueries, y2kPartyMenInclude, 'Y2K + Party has Party occasion queries');
dumpOnFail(
  occasionQueriesFor(y2kPartyMenInclude, 'bottom') > 0,
  y2kPartyMenInclude,
  'Y2K + Party include emits a Party occasion bottom query',
);
dumpOnFail(
  occasionQueriesFor(y2kPartyMenInclude, 'shoes') > 0,
  y2kPartyMenInclude,
  'Y2K + Party include emits a Party occasion shoe query',
);

const y2kPartyMenNone = requireRow(matrix, 'Y2K', 'Party', 'men', 'none');
dumpOnFail(
  occasionQueriesFor(y2kPartyMenNone, 'bottom') > 0,
  y2kPartyMenNone,
  'Y2K + Party no-shoes still emits a Party occasion bottom query',
);
dumpOnFail(
  occasionQueriesFor(y2kPartyMenNone, 'shoes') === 0 && !y2kPartyMenNone.hasShoeQueries,
  y2kPartyMenNone,
  'Y2K + Party no-shoes emits zero shoe queries',
);

const nightOutStreetInclude = requireRow(matrix, 'Streetwear', 'Night Out', 'men', 'include');
dumpOnFail(
  occasionQueriesFor(nightOutStreetInclude, 'bottom') > 0,
  nightOutStreetInclude,
  'Streetwear + Night Out include emits a Night Out occasion bottom query',
);
dumpOnFail(
  occasionQueriesFor(nightOutStreetInclude, 'shoes') > 0,
  nightOutStreetInclude,
  'Streetwear + Night Out include emits a Night Out occasion shoe query',
);

const nightOutStreetNone = requireRow(matrix, 'Streetwear', 'Night Out', 'women', 'none');
dumpOnFail(
  occasionQueriesFor(nightOutStreetNone, 'bottom') > 0,
  nightOutStreetNone,
  'Night Out no-shoes still emits a Night Out occasion bottom query',
);
dumpOnFail(
  occasionQueriesFor(nightOutStreetNone, 'shoes') === 0 && !nightOutStreetNone.hasShoeQueries,
  nightOutStreetNone,
  'Night Out no-shoes emits zero shoe queries',
);

const streetWorkMenInclude = requireRow(matrix, 'Streetwear', 'Work', 'men', 'include');
dumpOnFail(
  occasionQueriesFor(streetWorkMenInclude, 'top') > 0,
  streetWorkMenInclude,
  'Streetwear + Work has Work occasion queries for tops',
);

const nightOutOccasion = generateSearchQueries(
  { occasion: 'Night Out', category: 'top', gender: 'men' },
  LIVE_STRATEGY_LIMITS.maxQueries,
);
assert(
  nightOutOccasion.some((query) => query.source === 'occasion' && /going out|nightlife|camp collar|satin/i.test(query.text)),
  'Night Out as an occasion emits going-out queries',
);
const nightOutAsStyle = generateSearchQueries(
  { style: 'Night Out', category: 'top', gender: 'men' },
  LIVE_STRATEGY_LIMITS.maxQueries,
);
assert(
  nightOutAsStyle.every((query) => query.source !== 'style' || !/going out|nightlife|camp collar/i.test(query.text)),
  'Night Out is not retrieved as a style',
);

let overBudget = 0;
let starvedOccasion = 0;
for (const style of STYLES) {
  for (const occasion of OCCASIONS) {
    for (const gender of GENDERS) {
      for (const shoes of SHOES) {
        for (const category of liveRetrievalCategories(shoes)) {
          const generated = generateSearchQueries(
            { style, occasion, category, gender },
            LIVE_STRATEGY_LIMITS.maxQueries,
          );
          if (generated.length > LIVE_STRATEGY_LIMITS.maxQueries) overBudget += 1;
          const availableOccasion = occasionRetrievalConcepts(occasion).filter((concept) =>
            conceptAllowed(concept, category, gender),
          );
          const styleCount = generated.filter((query) => query.source === 'style').length;
          const occasionCount = generated.filter((query) => query.source === 'occasion').length;
          if (availableOccasion.length && normalizeIntentKey(style) !== normalizeIntentKey(occasion)) {
            const reserved = Math.min(RESERVED_OCCASION_QUERY_SLOTS, availableOccasion.length);
            if (occasionCount < reserved || styleCount > LIVE_STRATEGY_LIMITS.maxQueries - reserved) {
              if (starvedOccasion === 0) {
                console.error('starved example', {
                  style,
                  occasion,
                  gender,
                  shoes,
                  category,
                  styleCount,
                  occasionCount,
                  reserved,
                  available: availableOccasion.map((concept) => concept.phrase),
                  queries: generated.map((query) => `${query.source}:${query.text}`),
                });
              }
              starvedOccasion += 1;
            }
          }
        }
      }
    }
  }
}
assert(overBudget === 0, 'no category batch exceeds live maxQueries 5');
assert(
  starvedOccasion === 0,
  'a 5-concept style cannot consume all 5 slots when the occasion has available concepts',
);

let duplicateCategoryQueries = 0;
for (const row of matrix) {
  const seen = new Set<string>();
  for (const query of row.queries) {
    const key = `${query.category}|${query.text.toLowerCase()}`;
    if (seen.has(key)) duplicateCategoryQueries += 1;
    seen.add(key);
  }
}
assert(duplicateCategoryQueries === 0, 'no duplicate query strings within a category batch');

for (const row of matrix.filter((entry) => entry.shoes === 'include')) {
  const shoeQueries = row.queries.filter((query) => query.category === 'shoes');
  if (row.gender === 'men') {
    assert(
      shoeQueries.every((query) => /\bmen\b/i.test(query.text)),
      `${row.style}+${row.occasion} men shoe queries keep gender suffix`,
    );
  }
}

const quietEveryday = requireRow(matrix, 'Quiet Luxury', 'Everyday', 'men', 'include');
const darkSchool = requireRow(matrix, 'Dark Academia', 'School', 'men', 'include');
const elevatedEveryday = requireRow(matrix, 'Elevated Streetwear', 'Everyday', 'men', 'include');
const formalEvent = requireRow(matrix, 'Formal', 'Event', 'men', 'include');

dumpOnFail(quietEveryday.styleQueryCount > 0, quietEveryday, 'Quiet Luxury + Everyday has style queries');
dumpOnFail(darkSchool.styleQueryCount > 0, darkSchool, 'Dark Academia + School has style queries');
dumpOnFail(elevatedEveryday.styleQueryCount > 0, elevatedEveryday, 'Elevated Streetwear + Everyday has style queries');
dumpOnFail(formalEvent.hasOccasionQueries, formalEvent, 'Formal + Event has Event occasion queries');

assert(
  !quietEveryday.queries.some((query) => /old money/i.test(query.text)),
  'Quiet Luxury retrieval is not an Old Money alias',
);
assert(
  !darkSchool.queries.some((query) => /flannel|combat boot|band tee/i.test(query.text)),
  'Dark Academia retrieval is not a Grunge alias',
);
assert(
  !elevatedEveryday.queries.some((query) => /streetwear oversized hoodie/i.test(query.text)),
  'Elevated Streetwear retrieval is not a Streetwear hoodie alias',
);

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);
console.log(`matrix combinations: ${matrix.length}`);
console.log('\n===== Y2K + Party men include =====');
console.log(formatCombo(y2kPartyMenInclude));
console.log('\n===== Streetwear + Work men include =====');
console.log(formatCombo(streetWorkMenInclude));
console.log('\n===== Quiet Luxury + Everyday men include =====');
console.log(formatCombo(quietEveryday));
console.log('\n===== Dark Academia + School men include =====');
console.log(formatCombo(darkSchool));
console.log('\n===== Elevated Streetwear + Everyday men include =====');
console.log(formatCombo(elevatedEveryday));
console.log('\n===== Formal + Event men include =====');
console.log(formatCombo(formalEvent));
console.log('\n===== Y2K + Party men none =====');
console.log(formatCombo(y2kPartyMenNone));
console.log('\n===== Streetwear + Night Out men include =====');
console.log(formatCombo(nightOutStreetInclude));
