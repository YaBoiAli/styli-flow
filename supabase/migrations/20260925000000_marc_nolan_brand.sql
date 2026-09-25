-- Dress-shoe specialist used for date / classy fits only (ranking enforces that).
insert into public.brands (name, domain, is_approved) values
  ('Marc Nolan', 'marcnolan.com', true)
on conflict (domain) do nothing;
