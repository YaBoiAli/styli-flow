import { GeminiFashionAIProvider } from './geminiFashionAI.ts';
import type { FashionAIProvider } from './types.ts';

export function createFashionAIProvider(): FashionAIProvider {
  return new GeminiFashionAIProvider();
}
