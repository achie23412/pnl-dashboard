-- Store settings: media buyer fee per store, with the date it starts.
-- No row, or no start date = no media buyer fee. Run once in Supabase → SQL editor. Safe to run again.
create table if not exists store_settings (
  store text primary key,
  media_buyer_fee_pct numeric not null default 10,
  media_buyer_fee_from date,          -- null = fee off
  updated_at timestamptz not null default now(),
  updated_by text
);
grant select, insert, update, delete on store_settings to service_role;
alter table store_settings enable row level security;
