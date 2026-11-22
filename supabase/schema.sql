-- P&L Dashboard Schema
-- Run this in Supabase SQL Editor after creating the project

create table daily_revenue (
  id bigint generated always as identity primary key,
  date date not null,
  store text not null,
  revenue numeric(12,2) not null default 0,
  orders integer not null default 0,
  unique (date, store)
);

create table daily_spend (
  id bigint generated always as identity primary key,
  date date not null,
  channel text not null,
  account text not null,
  store text not null,
  spend numeric(12,2) not null default 0,
  unique (date, channel, account)
);

create table daily_cogs (
  id bigint generated always as identity primary key,
  date date not null,
  store text not null,
  cogs numeric(12,2) not null default 0,
  unique (date, store)
);

create table refresh_log (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  revenue_rows integer,
  spend_rows integer,
  cogs_rows integer,
  error text
);

-- Indexes for date-range queries
create index idx_revenue_date on daily_revenue (date);
create index idx_spend_date on daily_spend (date);
create index idx_cogs_date on daily_cogs (date);

-- RLS: public read, service-role write
alter table daily_revenue enable row level security;
alter table daily_spend enable row level security;
alter table daily_cogs enable row level security;
alter table refresh_log enable row level security;

create policy "Public read revenue" on daily_revenue for select using (true);
create policy "Public read spend" on daily_spend for select using (true);
create policy "Public read cogs" on daily_cogs for select using (true);
create policy "Public read refresh_log" on refresh_log for select using (true);

create policy "Service write revenue" on daily_revenue for all using (true) with check (true);
create policy "Service write spend" on daily_spend for all using (true) with check (true);
create policy "Service write cogs" on daily_cogs for all using (true) with check (true);
create policy "Service write refresh_log" on refresh_log for all using (true) with check (true);
