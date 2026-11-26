-- OnlineJobs.ph Timeproof hours per worker per day, pasted into Team Hub (OnlineJobs.ph has no API).
-- Compared with Hubstaff on the Team Hub page. Run once in Supabase → SQL editor → Run.

create table if not exists timeproof_hours (
  worker text not null,                  -- name as shown on OnlineJobs.ph
  work_date date not null,               -- day as OnlineJobs.ph shows it to the employer
  minutes int not null check (minutes between 0 and 1440),
  imported_at timestamptz not null default now(),
  primary key (worker, work_date)
);

-- Server only (service role); closed to the public key like every other table
alter table timeproof_hours enable row level security;
revoke all on timeproof_hours from anon, authenticated;
grant select, insert, update, delete on timeproof_hours to service_role;

notify pgrst, 'reload schema';
