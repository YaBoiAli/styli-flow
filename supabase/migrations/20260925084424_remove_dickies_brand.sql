-- Drop Dickies from the shoppable catalog.
-- Saved-outfit rows stay (outfit_items ON DELETE RESTRICT); those products
-- are marked discontinued so they are not used for new generation.

update public.products
set
  availability = 'discontinued',
  updated_at = now()
where brand_id in (
    select id from public.brands
    where domain = 'dickies.com' or lower(name) = 'dickies'
  )
  or lower(brand) = 'dickies';

delete from public.products
where (
    brand_id in (
      select id from public.brands
      where domain = 'dickies.com' or lower(name) = 'dickies'
    )
    or lower(brand) = 'dickies'
  )
  and not exists (
    select 1 from public.outfit_items as items
    where items.product_id = products.id
  );

update public.brands
set
  is_approved = false,
  status = 'unsupported',
  unsupported_reason = 'Removed from catalog',
  product_count = (
    select count(*) from public.products
    where brand_id = brands.id
  ),
  updated_at = now()
where domain = 'dickies.com' or lower(name) = 'dickies';
