-- GMC Health (Google stores: Susan & Allen, Carter & Collins, Walsh & Farley).
-- Filled by /api/cron/gmc (daily) from Google's Merchant API. Run once in Supabase → SQL editor.

-- Per store: Merchant Center ID and the limits
create table if not exists gmc_settings (
  store text primary key,
  merchant_id text,                         -- Merchant Center account ID (not secret)
  max_cog_pct numeric not null default 30,  -- price recommendation is blocked above this COG%
  feed_change_pct numeric not null default 10, -- max % of the feed's products changed per day
  max_drafts_per_day int not null default 50,
  feed_products int,                        -- Shopify products in the GMC feed at the last sync
  feed_items int,                           -- feed items (variants)
  last_sync_at timestamptz,
  last_sync_error text,
  updated_at timestamptz not null default now()
);
insert into gmc_settings (store) values ('Susan & Allen'), ('Carter & Collins'), ('Walsh & Farley')
on conflict (store) do nothing;

-- One row per feed item per issue. first_seen = first daily sync that saw it ("since when").
create table if not exists gmc_issues (
  store text not null,
  offer_id text not null,                   -- e.g. shopify_GB_<productId>_<variantId>
  issue_code text not null,
  product_id text,
  variant_id text,
  title text,
  description text,
  detail text,
  resolution text,
  severity text,                            -- DISAPPROVED / DEMOTED / NOT_IMPACTED
  attribute text,
  countries text[],
  documentation text,
  first_seen date not null,
  last_seen date not null,
  resolved_on date,                         -- set when a sync no longer sees it
  primary key (store, offer_id, issue_code)
);
create index if not exists idx_gmc_issues_open on gmc_issues (store, resolved_on);

-- Google's "lower price" suggestions (price insights), replaced each sync
create table if not exists gmc_price_insights (
  store text not null,
  offer_id text not null,
  product_id text,
  variant_id text,
  title text,
  price numeric,
  suggested_price numeric,
  currency text,
  predicted_impressions_change numeric,     -- fraction, 0.12 = +12%
  predicted_clicks_change numeric,
  predicted_conversions_change numeric,
  effectiveness text,
  fetched_on date not null,
  primary key (store, offer_id)
);

-- Every feed change made from the dashboard (price, title, draft, publish). Also the drafting log:
-- product, date (planned_for) and reason/rule. Over the daily limit = queued for a later day.
create table if not exists feed_changes (
  id bigint generated always as identity primary key,
  store text not null,
  product_id text not null,
  variant_id text,
  title text,
  kind text not null check (kind in ('price', 'title', 'draft', 'publish')),
  old_value text,
  new_value text,
  reason text,
  status text not null default 'queued' check (status in ('queued', 'applied', 'failed', 'cancelled')),
  planned_for date not null,                -- Amsterdam day it counts against
  applied_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  created_by text
);
create index if not exists idx_feed_changes_day on feed_changes (store, planned_for, status);

-- Server only (service role); closed to the public key like every other table
alter table gmc_settings enable row level security;
alter table gmc_issues enable row level security;
alter table gmc_price_insights enable row level security;
alter table feed_changes enable row level security;
revoke all on gmc_settings, gmc_issues, gmc_price_insights, feed_changes from anon, authenticated;
grant select, insert, update, delete on gmc_settings, gmc_issues, gmc_price_insights, feed_changes to service_role;

notify pgrst, 'reload schema';
