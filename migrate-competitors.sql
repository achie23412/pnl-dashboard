-- Alter competitors table for TrendTrack integration
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS domain TEXT,
  ADD COLUMN IF NOT EXISTS monthly_visits BIGINT,
  ADD COLUMN IF NOT EXISTS growth_30d NUMERIC(6,1),
  ADD COLUMN IF NOT EXISTS markets JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS products_count INTEGER,
  ADD COLUMN IF NOT EXISTS est_monthly_revenue NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS est_units_sold INTEGER,
  ADD COLUMN IF NOT EXISTS trendtrack_id TEXT,
  ADD COLUMN IF NOT EXISTS last_synced TIMESTAMPTZ;

-- Unique constraint on domain for upserts (no partial — needed for ON CONFLICT)
DO $$ BEGIN
  ALTER TABLE competitors ADD CONSTRAINT competitors_domain_key UNIQUE (domain);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow anon to update status/notes from frontend
DO $$ BEGIN
  CREATE POLICY "anon_update_competitors" ON competitors FOR UPDATE TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow anon to delete
DO $$ BEGIN
  CREATE POLICY "anon_delete_competitors" ON competitors FOR DELETE TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
