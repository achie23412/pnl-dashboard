-- Monthly visitors per competitor (TrendTrack), so the Season Board can draw a line per niche
-- and warn when a season starts. One row per store per month.
--   source 'history'  = TrendTrack's monthly traffic history (filled once per store)
--   source 'snapshot' = TrendTrack's current monthly visits, saved daily for the current month
--   source 'tracker'  = the number already in the Competitor Tracker (seed, this month only)
-- Run once in Supabase → SQL editor → Run. Safe to run again.
create table if not exists competitor_visits (
  domain text not null,
  month date not null,                 -- first day of the month
  monthly_visits bigint not null,
  source text not null default 'snapshot',
  captured_at timestamptz not null default now(),
  primary key (domain, month)
);
create index if not exists idx_competitor_visits_month on competitor_visits (month);

-- Which Season Board category a competitor belongs to (empty = worked out from niche/name)
alter table competitors add column if not exists season_category text;
-- When TrendTrack's traffic history was copied for this store (null = not yet)
alter table competitors add column if not exists tt_history_at timestamptz;

alter table competitor_visits enable row level security;
revoke all on competitor_visits from anon, authenticated;
grant select, insert, update, delete on competitor_visits to service_role;

-- Seed: this month's number from the Competitor Tracker, so the board has a first point today
insert into competitor_visits (domain, month, monthly_visits, source)
select domain, date_trunc('month', now())::date, monthly_visits, 'tracker'
from competitors where domain is not null and monthly_visits is not null and monthly_visits > 0
on conflict (domain, month) do nothing;

notify pgrst, 'reload schema';
