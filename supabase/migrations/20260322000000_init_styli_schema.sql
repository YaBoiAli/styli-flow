-- Styli Stage 2 schema: products, profiles, outfits, outfit_items + RLS

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- products (public catalog)
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  category text not null check (category in ('top', 'bottom', 'shoes', 'outerwear', 'accessory')),
  price numeric(10, 2) not null check (price > 0),
  color text not null,
  image_url text not null,
  purchase_url text not null,
  style_tags text[] not null default '{}',
  occasion_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category);
create index if not exists products_price_idx on public.products (price);
create index if not exists products_style_tags_idx on public.products using gin (style_tags);
create index if not exists products_occasion_tags_idx on public.products using gin (occasion_tags);

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  preferred_styles text[] not null default '{}',
  preferred_occasions text[] not null default '{}',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- outfits
-- ---------------------------------------------------------------------------
create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  outfit_name text not null,
  style text not null,
  occasion text not null,
  budget numeric(10, 2) not null check (budget > 0),
  total_price numeric(10, 2) not null check (total_price >= 0),
  styling_tip text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists outfits_user_id_idx on public.outfits (user_id);

-- ---------------------------------------------------------------------------
-- outfit_items
-- ---------------------------------------------------------------------------
create table if not exists public.outfit_items (
  id uuid primary key default gen_random_uuid(),
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  reason text not null default '',
  unique (outfit_id, product_id)
);

create index if not exists outfit_items_outfit_id_idx on public.outfit_items (outfit_id);
create index if not exists outfit_items_product_id_idx on public.outfit_items (product_id);

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;

-- Products: publicly readable; writes reserved for service role / future admin
drop policy if exists "Products are publicly readable" on public.products;
create policy "Products are publicly readable"
  on public.products
  for select
  to anon, authenticated
  using (true);

-- Profiles: owner only
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Outfits: owner only
drop policy if exists "Users can view own outfits" on public.outfits;
create policy "Users can view own outfits"
  on public.outfits
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own outfits" on public.outfits;
create policy "Users can insert own outfits"
  on public.outfits
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own outfits" on public.outfits;
create policy "Users can update own outfits"
  on public.outfits
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own outfits" on public.outfits;
create policy "Users can delete own outfits"
  on public.outfits
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Outfit items: access via owning outfit
drop policy if exists "Users can view own outfit items" on public.outfit_items;
create policy "Users can view own outfit items"
  on public.outfit_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.outfits o
      where o.id = outfit_id and o.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert own outfit items" on public.outfit_items;
create policy "Users can insert own outfit items"
  on public.outfit_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.outfits o
      where o.id = outfit_id and o.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own outfit items" on public.outfit_items;
create policy "Users can update own outfit items"
  on public.outfit_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.outfits o
      where o.id = outfit_id and o.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.outfits o
      where o.id = outfit_id and o.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own outfit items" on public.outfit_items;
create policy "Users can delete own outfit items"
  on public.outfit_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.outfits o
      where o.id = outfit_id and o.user_id = auth.uid()
    )
  );
