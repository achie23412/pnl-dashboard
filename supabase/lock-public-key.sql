-- Close the database to the public (anon) and authenticated Supabase keys.
-- Run only after the pages read through /api/db (commit 704aea3) are live: the dashboard's
-- server uses the service role, which these rules don't apply to, so it keeps working.
-- The anon key is in the website's JavaScript, so without this anyone could read
-- revenue, ad spend, COGS and refunds straight from Supabase.

-- 1. Row level security on every table, with no policies, so anon/authenticated see no rows
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- 2. Take away the table, sequence and function grants as well
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

-- 3. Tables created later start closed too
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

notify pgrst, 'reload schema';
