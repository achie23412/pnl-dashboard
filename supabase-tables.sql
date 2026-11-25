-- Run this in Supabase SQL editor to create the new tables

-- Refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  store TEXT NOT NULL,
  order_id TEXT DEFAULT '',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('shopify', 'shipgoods', 'manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'refunded', 'resolved', 'disputed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_refunds" ON refunds FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_refunds" ON refunds FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "service_all_refunds" ON refunds FOR ALL TO service_role USING (true);

-- Research table
CREATE TABLE IF NOT EXISTS research (
  id BIGSERIAL PRIMARY KEY,
  product_name TEXT NOT NULL,
  niche TEXT DEFAULT '',
  google_trends TEXT DEFAULT 'unknown',
  top_sellers TEXT DEFAULT '',
  active_ads INTEGER,
  reach INTEGER,
  reach_age_days INTEGER,
  reach_pass BOOLEAN,
  new_ads_per_day TEXT DEFAULT '',
  momentum TEXT DEFAULT '',
  sold_by_multiple BOOLEAN DEFAULT false,
  verdict TEXT DEFAULT 'maybe' CHECK (verdict IN ('test', 'skip', 'maybe')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE research ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_research" ON research FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_research" ON research FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "service_all_research" ON research FOR ALL TO service_role USING (true);

-- Competitors table
CREATE TABLE IF NOT EXISTS competitors (
  id BIGSERIAL PRIMARY KEY,
  store_name TEXT NOT NULL,
  store_url TEXT DEFAULT '',
  niche TEXT DEFAULT '',
  active_ads INTEGER,
  last_checked DATE DEFAULT CURRENT_DATE,
  ppspy_rank INTEGER,
  ad_library_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'new' CHECK (status IN ('watching', 'scaling', 'dead', 'new')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_competitors" ON competitors FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_competitors" ON competitors FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "service_all_competitors" ON competitors FOR ALL TO service_role USING (true);

-- To-do list on the Calendar page (custom tasks + "done" marks for auto must-dos)
create table if not exists todos (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  date date,
  label text not null,
  note text,
  store text,
  done boolean not null default false,
  done_at timestamptz,
  source text not null default 'custom',
  auto_key text unique
);
alter table todos enable row level security;
grant select, insert, update, delete on todos to service_role;
grant usage, select on sequence todos_id_seq to service_role;

-- Product listing workflow (Product Importer page): one row per product going through
-- fetch → Ascend SOP listing → GMC check → review → Shopify draft → publish
create table if not exists listing_jobs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  store text not null,
  source_url text not null,
  status text not null default 'working',
  before jsonb,
  after jsonb,
  price numeric,
  gmc jsonb,
  error text,
  notes text,
  shopify_product_id text,
  shopify_admin_url text,
  published_at timestamptz
);
alter table listing_jobs enable row level security;
grant select, insert, update, delete on listing_jobs to service_role;
grant usage, select on sequence listing_jobs_id_seq to service_role;
