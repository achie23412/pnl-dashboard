-- Balances typed in by hand for payment processors without an API (PayPal, Whale Checkout, Other).
-- Run once in Supabase → SQL editor. Safe to run again.
create table if not exists processor_balances (
  processor text primary key,
  balance_eur numeric not null,
  as_of date not null default current_date,
  updated_at timestamptz not null default now(),
  updated_by text
);
grant select, insert, update, delete on processor_balances to service_role;
alter table processor_balances enable row level security;
