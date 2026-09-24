-- Product-source layer: brands, normalized product fields, ingestion log.
-- Additive only: existing product ids, outfits and outfit_items are untouched.

-- ---------------------------------------------------------------------------
-- brands: every brand the catalog knows about (approved list + user-added)
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null unique,
  is_approved boolean not null default false,
  -- A brand is only 'supported' after real products were retrieved and normalized.
  status text not null default 'pending'
    check (status in ('pending', 'checking', 'supported', 'unsupported', 'error')),
  source_type text
    check (source_type in (
      'official_api', 'affiliate_feed', 'shopify', 'structured_data',
      'direct_website', 'external_search'
    )),
  -- Non-secret source settings only (e.g. feed network, env var names). Never store keys here.
  source_config jsonb not null default '{}'::jsonb,
  unsupported_reason text,
  product_count integer not null default 0,
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('succeeded', 'failed')),
  last_sync_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brands_status_idx on public.brands (status);
create index if not exists brands_last_synced_idx on public.brands (last_synced_at);

alter table public.brands enable row level security;

drop policy if exists "Brands are publicly readable" on public.brands;
create policy "Brands are publicly readable"
  on public.brands
  for select
  to anon, authenticated
  using (true);

grant select on public.brands to anon, authenticated;

-- ---------------------------------------------------------------------------
-- products: normalized fields shared by every source
-- `name` is product_name and `purchase_url` is product_url (kept for saved outfits).
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists brand_id uuid references public.brands (id) on delete set null,
  add column if not exists description text,
  add column if not exists currency text not null default 'USD',
  add column if not exists subcategory text,
  add column if not exists colors text[] not null default '{}',
  add column if not exists sizes text[] not null default '{}',
  add column if not exists material text,
  add column if not exists gender text check (gender in ('men', 'women', 'unisex')),
  add column if not exists availability text not null default 'in_stock'
    check (availability in ('in_stock', 'out_of_stock', 'unknown', 'discontinued')),
  add column if not exists source text not null default 'demo'
    check (source in (
      'demo', 'official_api', 'affiliate_feed', 'shopify', 'structured_data',
      'direct_website', 'external_search'
    )),
  add column if not exists source_product_id text,
  add column if not exists last_checked timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Existing seed rows pick up source = 'demo' from the column default above.
-- NULL source_product_id (demo rows) never conflicts, so upserts can target this key.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_source_product_key'
  ) then
    alter table public.products
      add constraint products_source_product_key unique (source, source_product_id);
  end if;
end
$$;

create index if not exists products_brand_id_idx on public.products (brand_id);
create index if not exists products_source_idx on public.products (source);
create index if not exists products_availability_idx on public.products (availability);
create index if not exists products_gender_idx on public.products (gender);

-- ---------------------------------------------------------------------------
-- ingestion_runs: one row per sync attempt, for debugging and monitoring
-- ---------------------------------------------------------------------------
create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  trigger text not null default 'sync' check (trigger in ('resolve', 'sync', 'manual')),
  source_type text,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  products_found integer not null default 0,
  products_upserted integer not null default 0,
  products_marked_unavailable integer not null default 0,
  attempts jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists ingestion_runs_brand_idx on public.ingestion_runs (brand_id, started_at desc);

-- Service role only (no policies for anon/authenticated).
alter table public.ingestion_runs enable row level security;

-- ---------------------------------------------------------------------------
-- brand_requests: link a user's request to the brand record it resolved to
-- ---------------------------------------------------------------------------
alter table public.brand_requests
  add column if not exists brand_id uuid references public.brands (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Approved brands start as 'pending' until a real import succeeds.
-- ---------------------------------------------------------------------------
insert into public.brands (name, domain, is_approved) values
  ('Zara', 'zara.com', true),
  ('Hollister', 'hollisterco.com', true),
  ('Old Navy', 'oldnavy.com', true),
  ('Gap', 'gap.com', true),
  ('Gap Factory', 'gapfactory.com', true),
  ('American Eagle', 'ae.com', true),
  ('Levi''s', 'levi.com', true),
  ('J.Crew Factory', 'factory.jcrew.com', true),
  ('Banana Republic Factory', 'bananarepublicfactory.com', true),
  ('Abercrombie', 'abercrombie.com', true),
  ('H&M', 'hm.com', true),
  ('Uniqlo', 'uniqlo.com', true),
  ('Nike', 'nike.com', true),
  ('Adidas', 'adidas.com', true),
  ('Puma', 'puma.com', true),
  ('Champion', 'champion.com', true),
  ('Calvin Klein', 'calvinklein.us', true),
  ('Tommy Hilfiger', 'tommy.com', true),
  ('Ralph Lauren', 'ralphlauren.com', true),
  ('PacSun', 'pacsun.com', true),
  ('Forever 21', 'forever21.com', true),
  ('Urban Outfitters', 'urbanoutfitters.com', true),
  ('ASOS', 'asos.com', true),
  ('Mango', 'mango.com', true),
  ('Express', 'express.com', true),
  ('Reebok', 'reebok.com', true),
  ('New Balance', 'newbalance.com', true),
  ('Dickies', 'dickies.com', true),
  ('Carhartt', 'carhartt.com', true),
  ('Vans', 'vans.com', true),
  ('Converse', 'converse.com', true)
on conflict (domain) do nothing;
