-- Refund control (Customer Service → Refunds): owner approval above €100, chargeback
-- threat flag, Shopify check per logged refund, change history and evidence files.
-- Run once in Supabase → SQL editor → Run. Safe to run again.

alter table cs_refunds drop constraint if exists cs_refunds_refund_type_check;
alter table cs_refunds add constraint cs_refunds_refund_type_check check (refund_type in ('full', 'partial', 'full_after_return'));

alter table cs_refunds add column if not exists amount_eur numeric;
alter table cs_refunds add column if not exists threat boolean not null default false;
-- not_needed (≤ €100) | waiting (> €100, don't refund yet) | flagged (threat: refunded at once, owner informed) | approved | rejected
alter table cs_refunds add column if not exists approval_status text not null default 'not_needed';
alter table cs_refunds add column if not exists approved_by text;
alter table cs_refunds add column if not exists approved_at timestamptz;
-- checking | refunded | partial | not_refunded | no_order
alter table cs_refunds add column if not exists shopify_status text not null default 'checking';
alter table cs_refunds add column if not exists shopify_refunded numeric;
alter table cs_refunds add column if not exists shopify_refunded_at timestamptz;
alter table cs_refunds add column if not exists shopify_checked_at timestamptz;
alter table cs_refunds add column if not exists attachments jsonb not null default '[]';
alter table cs_refunds add column if not exists updated_at timestamptz;

create table if not exists cs_refund_history (
  id bigserial primary key,
  refund_id bigint not null references cs_refunds(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by text,
  action text not null,          -- created | edited | approved | rejected | evidence_added | evidence_removed
  changes jsonb not null default '{}'
);
create index if not exists idx_cs_refund_history_refund on cs_refund_history (refund_id);

grant select, insert, update, delete on cs_refund_history to service_role;
grant usage, select on all sequences in schema public to service_role;
alter table cs_refund_history enable row level security;

-- Private bucket for refund evidence (photos, PDFs). Read through signed links only.
insert into storage.buckets (id, name, public) values ('cs-evidence', 'cs-evidence', false)
on conflict (id) do nothing;
