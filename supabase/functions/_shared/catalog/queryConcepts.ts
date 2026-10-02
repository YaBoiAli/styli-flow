import type { ProductCategory, ProductGender } from './types.ts';

export type QueryConcept = {
  phrase: string;
  categories: ProductCategory[];
  genders?: ProductGender[];
};

export function all(phrase: string, ...categories: ProductCategory[]): QueryConcept {
  return { phrase, categories };
}

export function men(phrase: string, ...categories: ProductCategory[]): QueryConcept {
  return { phrase, categories, genders: ['men'] };
}

export function women(phrase: string, ...categories: ProductCategory[]): QueryConcept {
  return { phrase, categories, genders: ['women'] };
}
