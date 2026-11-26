-- When a background sync last ran (Refunds page: "last synced"), one row per job.
-- Run once in Supabase → SQL editor → Run. Safe to run again.
create table if not exists sync_status (
  key text primary key,            -- e.g. 'refund-check'
  ran_at timestamptz not null default now(),
  ok boolean not null default true,
  result jsonb not null default '{}'
);
alter table sync_status enable row level security;
revoke all on sync_status from anon, authenticated;
grant select, insert, update, delete on sync_status to service_role;
notify pgrst, 'reload schema';
