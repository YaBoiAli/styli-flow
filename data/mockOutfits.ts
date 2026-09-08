/**
 * @deprecated Stage 1 hardcoded catalog.
 * Stage 2 loads products from Supabase via `@/lib/products`.
 * Kept as a thin re-export so older imports keep typechecking during transition.
 */
export { buildUiOutfit as buildMockOutfit } from '@/lib/outfitBuilder';
