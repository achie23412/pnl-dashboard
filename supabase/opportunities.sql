-- Product Opportunities workflow
-- Run once in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS everywhere).
--
-- Flow: competitor scan -> competitor_products -> opportunities (review)
--       -> import_jobs (Kopy-style import as DRAFT) -> adaptation checks -> ready.
-- Nothing here publishes products: imports are created with status = draft.

-- Products seen on tracked competitor stores (public Shopify product feeds).
create table if not exists competitor_products (
  id bigserial primary key,
  competitor_domain text not null,
  competitor_name text,
  markets text[] not null default '{}',
  shopify_product_id text not null,
  handle text not null,
  title text not null,
  url text not null,
  image text,
  product_type text,
  vendor text,
  tags text[] not null default '{}',
  price numeric(10,2),
  compare_at_price numeric(10,2),
  currency text,
  currency_assumed boolean not null default false,
  published_at timestamptz,
  bestseller_rank integer,
  first_seen date not null default current_date,
  last_seen date not null default current_date,
  unique (competitor_domain, shopify_product_id)
);
create index if not exists idx_cp_last_seen on competitor_products (last_seen);

-- Our own catalogue per store (for duplicate / gap checks). Replaced on each scan.
create table if not exists own_products (
  id bigserial primary key,
  store text not null,
  shopify_product_id text not null,
  handle text,
  title text not null,
  product_type text,
  scanned_at timestamptz not null default now(),
  unique (store, shopify_product_id)
);

create table if not exists opportunities (
  id bigserial primary key,
  cluster_key text not null unique,
  title text not null,
  category text,
  gender text,
  image text,
  status text not null default 'new' check (status in (
    'new', 'under_review', 'approved', 'queued', 'importing', 'imported',
    'adapting', 'ready_for_review', 'ready_to_publish',
    'saved', 'rejected', 'failed'
  )),
  priority text check (priority in ('high', 'medium', 'low')),
  priority_reason text,
  evidence_score integer,
  commercial_score integer,
  -- [{key, competitor_domain, competitor_name, url, title, image, price, currency,
  --   currency_assumed, first_seen, last_seen, published_at, bestseller_rank}]
  evidence jsonb not null default '[]',
  competitor_count integer not null default 0,
  observations text[] not null default '{}',
  inferences text[] not null default '{}',
  data_gaps text[] not null default '{}',
  season text,
  event_label text,
  event_date date,
  launch_by date,
  timing_source text,          -- 'calendar' | 'assumed'
  timing_note text,
  markets text[] not null default '{}',
  target_store text,
  source_url text,             -- which competitor product to import (one of evidence[].url)
  catalogue_match text,
  notes text not null default '',
  competitor_count_at_decision integer,
  adapt_checks jsonb not null default '{}',
  last_import_job_id bigint,
  first_observed date,
  last_observed date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_opp_status on opportunities (status);

create table if not exists opportunity_history (
  id bigserial primary key,
  opportunity_id bigint not null references opportunities(id) on delete cascade,
  at timestamptz not null default now(),
  from_status text,
  to_status text,
  note text
);
create index if not exists idx_opp_hist on opportunity_history (opportunity_id, at);

create table if not exists import_jobs (
  id bigserial primary key,
  opportunity_id bigint references opportunities(id) on delete set null,
  source_url text not null,
  store text not null,
  status text not null default 'queued' check (status in ('queued', 'importing', 'imported', 'failed')),
  method text not null default 'api' check (method in ('api', 'kopy')),
  shopify_product_id text,
  admin_url text,
  error text,
  attempts integer not null default 0,
  source_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store, source_url)          -- one job per product per store: no duplicate imports
);
create index if not exists idx_jobs_status on import_jobs (status);

-- RLS: dashboard reads with the anon key; all writes go through API routes
-- that use the service key.
alter table competitor_products enable row level security;
alter table own_products enable row level security;
alter table opportunities enable row level security;
alter table opportunity_history enable row level security;
alter table import_jobs enable row level security;

do $$ begin
  create policy "anon_read_competitor_products" on competitor_products for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "anon_read_own_products" on own_products for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "anon_read_opportunities" on opportunities for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "anon_read_opportunity_history" on opportunity_history for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "anon_read_import_jobs" on import_jobs for select to anon using (true);
exception when duplicate_object then null; end $$;
