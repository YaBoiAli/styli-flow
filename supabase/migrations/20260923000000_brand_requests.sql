-- User-suggested brands. These are review requests, not trusted inventory:
-- nothing here is shopped from until a brand is approved and sourced.

create table if not exists public.brand_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  brand_name text not null check (char_length(brand_name) between 1 and 80),
  website_url text not null check (website_url ~* '^https?://'),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists brand_requests_status_idx on public.brand_requests (status);

alter table public.brand_requests enable row level security;

-- Anyone may submit a request; only the service role can read or review them.
-- Signed-in users can only attribute a request to themselves.
drop policy if exists "Anyone can submit a brand request" on public.brand_requests;
create policy "Anyone can submit a brand request"
  on public.brand_requests
  for insert
  to anon, authenticated
  with check (
    status = 'requested'
    and (user_id is null or user_id = auth.uid())
  );

grant insert on public.brand_requests to anon, authenticated;
