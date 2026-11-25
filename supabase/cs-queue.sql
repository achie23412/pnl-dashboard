-- Inbox Queue notes, product follow-up and dispute cases (created 2026-11-25, approved by the owner).
-- Already run in Supabase; kept here for reference / a new project.
create table if not exists public.cs_tickets (
  id bigserial primary key,
  account_id bigint not null,
  conversation_id bigint not null,
  display_id bigint,
  store text,
  order_number text,
  scenario text,
  priority text check (priority in ('P1','P2','P3')),
  owner text,
  product_title text,
  complaint boolean not null default false,
  note text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (account_id, conversation_id)
);
create table if not exists public.cs_product_flags (
  id bigserial primary key,
  kind text not null check (kind in ('quality','risky','price')),
  store text not null,
  product_title text not null,
  status text not null default 'open',
  note text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, store, product_title)
);
create table if not exists public.dispute_cases (
  id bigserial primary key,
  store text not null,
  dispute_id text not null,
  order_number text,
  decision text check (decision in ('fight','accept','refund_inquiry')),
  evidence jsonb not null default '{}',
  note text,
  submitted_at timestamptz,
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store, dispute_id)
);
alter table public.cs_tickets enable row level security;
alter table public.cs_product_flags enable row level security;
alter table public.dispute_cases enable row level security;
grant select, insert, update, delete on public.cs_tickets, public.cs_product_flags, public.dispute_cases to service_role;
grant usage, select on sequence public.cs_tickets_id_seq, public.cs_product_flags_id_seq, public.dispute_cases_id_seq to service_role;
