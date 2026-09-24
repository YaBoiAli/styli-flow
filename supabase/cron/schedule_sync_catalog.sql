-- Hourly catalog refresh. sync-catalog only picks brands that are due, so each brand
-- refreshes about once a day (unsupported brands are rechecked weekly).
--
-- Run once per project in the SQL editor, after deploying sync-catalog and setting the
-- CATALOG_SYNC_SECRET function secret. Store the same values in Vault first:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as CATALOG_SYNC_SECRET>', 'catalog_sync_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('sync-catalog')
where exists (select 1 from cron.job where jobname = 'sync-catalog');

select cron.schedule(
  'sync-catalog',
  '15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/sync-catalog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'catalog_sync_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
