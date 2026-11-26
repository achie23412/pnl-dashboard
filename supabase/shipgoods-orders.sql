-- ShipGoods order costs, saved by the dashboard so pages don't wait on the ShipGoods API
-- (~6 s a page, max 90 days per request). One row per ShipGoods ledger row (order charge etc.).
-- Filled by /api/cron/warm (last 7 days, twice a day) and /api/shipgoods-sync (backfill).
-- Run once in Supabase → SQL editor → Run.

create table if not exists shipgoods_orders (
  id bigint primary key,                 -- ShipGoods row id
  bill_date date not null,
  row_type text,                         -- 'order_charge', refunds, fees…
  shop_admin_id bigint,
  store_name text,                       -- myshopify prefix, e.g. 'xq9pn7-dw'
  order_id text,                         -- Shopify order id
  order_number text,
  amount numeric,                        -- USD, negative = charge
  currency text,
  items jsonb not null default '[]',     -- [{product_id, title, unit_cost, quantity, product_cost, sold_price}]
  synced_at timestamptz not null default now()
);
create index if not exists idx_shipgoods_orders_date on shipgoods_orders (bill_date);

-- Which date range the table holds completely
create table if not exists shipgoods_sync (
  id int primary key default 1 check (id = 1),
  covered_from date,
  covered_to date,
  synced_at timestamptz
);

-- Server only (service role); closed to the public key like every other table
alter table shipgoods_orders enable row level security;
alter table shipgoods_sync enable row level security;
revoke all on shipgoods_orders, shipgoods_sync from anon, authenticated;
grant select, insert, update, delete on shipgoods_orders, shipgoods_sync to service_role;

notify pgrst, 'reload schema';
