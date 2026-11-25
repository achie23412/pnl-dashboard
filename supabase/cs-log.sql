-- Customer service log: refunds and store credits that CS logs by hand on the
-- dashboard (Customer Service → Refunds / Store Credit). Shopify's own refund
-- amounts keep syncing into the `refunds` table; this log adds the WHY.
-- Run once in Supabase → SQL editor → Run.

create table if not exists cs_refunds (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  store text not null,
  refund_date date not null,
  order_number text not null,           -- e.g. "#1042"
  shopify_order_id text,                -- filled when the order was found in Shopify
  customer_email text,
  conversation_url text,                -- CommsLayer conversation link
  refund_type text not null check (refund_type in ('full', 'partial')),
  reason text not null,                 -- see REFUND_REASONS in src/lib/cs-log.ts
  reason_note text,
  percentage numeric,                   -- % of the purchase price refunded
  amount numeric not null default 0,    -- refunded amount, store currency
  currency text not null default 'EUR',
  order_total numeric,                  -- what the customer paid for the order, store currency
  items jsonb not null default '[]',    -- [{title, variant, qty, price, product_id}]
  logged_by text
);
create index if not exists idx_cs_refunds_date on cs_refunds (refund_date);
create index if not exists idx_cs_refunds_store on cs_refunds (store);

create table if not exists cs_store_credits (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  store text not null,
  issue_date date not null,
  order_number text,
  customer_email text,
  conversation_url text,
  amount numeric not null default 0,
  currency text not null default 'EUR',
  percentage numeric,                   -- % of the purchase price given as credit
  reason text not null,
  reason_note text,
  code text,                            -- gift card / discount code
  status text not null default 'issued' check (status in ('issued', 'used', 'expired')),
  logged_by text
);
create index if not exists idx_cs_store_credits_date on cs_store_credits (issue_date);

-- API access: this project doesn't grant new tables to the API roles automatically.
grant select, insert, update, delete on cs_refunds, cs_store_credits to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on cs_refunds, cs_store_credits to anon;

alter table cs_refunds enable row level security;
alter table cs_store_credits enable row level security;
do $$ begin
  create policy "anon_read_cs_refunds" on cs_refunds for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "anon_read_cs_store_credits" on cs_store_credits for select to anon using (true);
exception when duplicate_object then null; end $$;
