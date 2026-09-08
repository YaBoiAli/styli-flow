-- Stage 4: ensure authenticated role can manage own outfits/profiles.
-- RLS policies already restrict rows to auth.uid().

grant select, insert, update, delete on public.outfits to authenticated;
grant select, insert, update, delete on public.outfit_items to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
