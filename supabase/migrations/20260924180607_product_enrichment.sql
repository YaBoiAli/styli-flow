-- AI fashion attributes on existing products. Source fields stay owned by ingest.
-- Additive: names, prices, images, URLs and saved outfits are untouched.

alter table public.products
  add column if not exists fit text
    check (fit in ('slim', 'regular', 'relaxed', 'oversized', 'fitted', 'loose', 'unknown')),
  add column if not exists silhouette text
    check (silhouette in (
      'skinny', 'straight', 'wide_leg', 'baggy', 'cropped', 'boxy', 'a_line',
      'bodycon', 'oversized', 'regular', 'unknown'
    )),
  add column if not exists pattern text
    check (pattern in (
      'solid', 'stripe', 'plaid', 'check', 'floral', 'graphic', 'logo', 'camo',
      'animal', 'colorblock', 'ribbed', 'textured', 'unknown'
    )),
  add column if not exists aesthetic_tags text[] not null default '{}',
  add column if not exists season_tags text[] not null default '{}',
  add column if not exists formality text
    check (formality in ('casual', 'smart_casual', 'formal', 'athletic', 'unknown')),
  add column if not exists fit_confidence numeric(3, 2)
    check (fit_confidence is null or (fit_confidence >= 0 and fit_confidence <= 1)),
  add column if not exists silhouette_confidence numeric(3, 2)
    check (silhouette_confidence is null or (silhouette_confidence >= 0 and silhouette_confidence <= 1)),
  add column if not exists gender_confidence numeric(3, 2)
    check (gender_confidence is null or (gender_confidence >= 0 and gender_confidence <= 1)),
  add column if not exists style_confidence numeric(3, 2)
    check (style_confidence is null or (style_confidence >= 0 and style_confidence <= 1)),
  add column if not exists ai_enriched boolean not null default false,
  add column if not exists ai_enriched_at timestamptz,
  add column if not exists enrichment_version integer,
  add column if not exists enrichment_input_hash text,
  add column if not exists enrichment_error text;

-- Allow AI to record "unknown" without overwriting a source men/women/unisex value.
alter table public.products drop constraint if exists products_gender_check;
alter table public.products
  add constraint products_gender_check
  check (gender is null or gender in ('men', 'women', 'unisex', 'unknown'));

-- Fingerprint of the fields Gemini is allowed to see. Price / stock / last_checked
-- are excluded so a daily catalog refresh does not re-enrich unchanged products.
alter table public.products
  add column if not exists content_fingerprint text
  generated always as (
    md5(
      coalesce(name, '') || chr(31) ||
      coalesce(description, '') || chr(31) ||
      coalesce(brand, '') || chr(31) ||
      coalesce(category, '') || chr(31) ||
      coalesce(image_url, '')
    )
  ) stored;

create index if not exists products_enrichment_due_idx
  on public.products (ai_enriched, enrichment_version)
  where source <> 'demo';

create index if not exists products_aesthetic_tags_idx
  on public.products using gin (aesthetic_tags);
create index if not exists products_season_tags_idx
  on public.products using gin (season_tags);

-- New product, updated content, or a new enrichment schema. Failed classifies
-- on the same content+version are not retried until one of those changes.
create or replace function public.products_due_for_enrichment(
  p_version integer,
  p_limit integer default 20
)
returns setof public.products
language sql
stable
as $$
  select *
  from public.products
  where source <> 'demo'
    and (
      ai_enriched is not true
      or enrichment_version is distinct from p_version
      or enrichment_input_hash is distinct from content_fingerprint
    )
    and not (
      enrichment_error is not null
      and enrichment_version is not distinct from p_version
      and enrichment_input_hash is not distinct from content_fingerprint
    )
  order by last_checked desc nulls last, id
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.products_due_for_enrichment(integer, integer) from public, anon, authenticated;
grant execute on function public.products_due_for_enrichment(integer, integer) to service_role;
