/**
 * Occasion retrieval-concept coverage by category and gender.
 * Makes zero- and single-concept cells obvious. Does not add concepts.
 * Offline only. Does not call Channel3.
 *
 * Run: npm run test:search-strategy
 */
import { OCCASIONS } from '../../../../../types/index.ts';
import { isClassyLook } from '../fashionSignals.ts';
import { OCCASION_CONTRACT, occasionContractFor } from '../styleOccasionContract.ts';
import type { ProductCategory, ProductGender } from '../types.ts';
import { conceptAllowed } from './vocabulary.ts';

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

const CATEGORIES: ProductCategory[] = ['top', 'bottom', 'shoes'];
const GENDERS: ProductGender[] = ['men', 'women'];

type Cell = {
  occasion: string;
  category: ProductCategory;
  gender: ProductGender;
  count: number;
  phrases: string[];
};

const cells: Cell[] = [];
for (const occasion of OCCASIONS) {
  const record = OCCASION_CONTRACT[occasion];
  for (const category of CATEGORIES) {
    for (const gender of GENDERS) {
      const matches = record.retrievalConcepts.filter((concept) =>
        conceptAllowed(concept, category, gender),
      );
      cells.push({
        occasion,
        category,
        gender,
        count: matches.length,
        phrases: matches.map((concept) => concept.phrase),
      });
    }
  }
}

function cellKey(cell: Pick<Cell, 'occasion' | 'category' | 'gender'>): string {
  return `${cell.occasion}|${cell.category}|${cell.gender}`;
}

const zeros = cells.filter((cell) => cell.count === 0);
const ones = cells.filter((cell) => cell.count === 1);

const KNOWN_ZERO = new Set([
  'Event|shoes|women',
]);

const KNOWN_ONE = new Set([
  'Everyday|top|men',
  'Everyday|top|women',
  'Everyday|bottom|men',
  'Everyday|bottom|women',
  'Everyday|shoes|men',
  'Everyday|shoes|women',
  'Date|top|men',
  'Date|bottom|men',
  'Date|bottom|women',
  'Date|shoes|men',
  'Date|shoes|women',
  'School|top|men',
  'School|top|women',
  'School|bottom|men',
  'School|bottom|women',
  'School|shoes|men',
  'School|shoes|women',
  'Work|top|men',
  'Work|top|women',
  'Work|bottom|men',
  'Work|bottom|women',
  'Work|shoes|men',
  'Work|shoes|women',
  'Vacation|top|men',
  'Vacation|top|women',
  'Vacation|bottom|men',
  'Vacation|bottom|women',
  'Vacation|shoes|men',
  'Vacation|shoes|women',
  'Event|top|men',
  'Event|top|women',
  'Event|bottom|men',
  'Event|bottom|women',
  'Event|shoes|men',
  'Party|bottom|men',
  'Party|bottom|women',
  'Party|shoes|men',
  'Party|shoes|women',
  'Night Out|shoes|men',
  'Night Out|shoes|women',
]);

console.log('Occasion retrieval coverage (concepts per category/gender):');
for (const occasion of OCCASIONS) {
  const parts = CATEGORIES.flatMap((category) =>
    GENDERS.map((gender) => {
      const cell = cells.find(
        (row) => row.occasion === occasion && row.category === category && row.gender === gender,
      )!;
      return `${category}/${gender}=${cell.count}`;
    }),
  );
  console.log(`  ${occasion}: ${parts.join('  ')}`);
}

console.log('\nZero-concept cells (style retrieval must carry this category):');
for (const cell of zeros) {
  console.log(`  ${cellKey(cell)}`);
}
console.log('\nSingle-concept cells (one reserved occasion slot, rest are style):');
for (const cell of ones) {
  console.log(`  ${cellKey(cell)}  (${cell.phrases.join(', ')})`);
}

const unexpectedZero = zeros.filter((cell) => !KNOWN_ZERO.has(cellKey(cell)));
const missingZero = [...KNOWN_ZERO].filter((key) => !zeros.some((cell) => cellKey(cell) === key));
const unexpectedOne = ones.filter((cell) => !KNOWN_ONE.has(cellKey(cell)));
const missingOne = [...KNOWN_ONE].filter((key) => !ones.some((cell) => cellKey(cell) === key));

assert(unexpectedZero.length === 0, `new zero-concept cells: ${unexpectedZero.map(cellKey).join(', ') || 'none'}`);
assert(missingZero.length === 0, `documented zero cells filled or renamed: ${missingZero.join(', ') || 'none'}`);
assert(unexpectedOne.length === 0, `new single-concept cells: ${unexpectedOne.map(cellKey).join(', ') || 'none'}`);
assert(missingOne.length === 0, `documented single-concept cells changed: ${missingOne.join(', ') || 'none'}`);

assert(
  cells.filter((cell) => cell.occasion === 'Party' && cell.category === 'bottom').every((cell) => cell.count > 0),
  'Party bottoms now have occasion concepts',
);
assert(
  cells.filter((cell) => cell.occasion === 'Party' && cell.category === 'shoes').every((cell) => cell.count > 0),
  'Party shoes now have occasion concepts',
);
assert(
  cells.filter((cell) => cell.occasion === 'Night Out' && cell.category !== 'top').every((cell) => cell.count > 0),
  'Night Out bottoms and shoes now have occasion concepts',
);
assert(
  ones.some((cell) => cell.occasion === 'Work' && cell.category === 'top' && cell.gender === 'men'),
  'Work men tops still have a single occasion concept',
);

const contractClassy = OCCASIONS.filter((occasion) => OCCASION_CONTRACT[occasion].classyFootwear).map(
  (occasion) => OCCASION_CONTRACT[occasion].key,
);
console.log(`\nOCCASION_CONTRACT.classyFootwear: ${contractClassy.join(', ')}`);
assert(isClassyLook('Streetwear', 'Party') === OCCASION_CONTRACT.Party.classyFootwear, 'isClassyLook Party follows OCCASION_CONTRACT');
assert(isClassyLook('Streetwear', 'Date') === OCCASION_CONTRACT.Date.classyFootwear, 'isClassyLook Date follows OCCASION_CONTRACT');
assert(isClassyLook('Streetwear', 'Work') === OCCASION_CONTRACT.Work.classyFootwear, 'isClassyLook Work follows OCCASION_CONTRACT');
assert(isClassyLook('Streetwear', 'Event') === OCCASION_CONTRACT.Event.classyFootwear, 'isClassyLook Event follows OCCASION_CONTRACT');
assert(
  isClassyLook('Streetwear', 'Night Out') === OCCASION_CONTRACT['Night Out'].classyFootwear,
  'isClassyLook Night Out follows OCCASION_CONTRACT',
);
assert(
  isClassyLook('Streetwear', 'Everyday') === OCCASION_CONTRACT.Everyday.classyFootwear,
  'isClassyLook Everyday follows OCCASION_CONTRACT',
);
assert(
  isClassyLook('Casual', 'formal event') === Boolean(occasionContractFor('formal event')?.classyFootwear),
  'isClassyLook formal event alias follows canonical Event classyFootwear',
);
assert(
  typeof OCCASION_CONTRACT.Event.classyFootwear === 'boolean',
  'contract classyFootwear remains the Phase 1 source of truth for retrieval',
);

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
