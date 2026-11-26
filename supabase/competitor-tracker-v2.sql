-- Competitor Tracker v2: monthly visitor snapshots + coverage tracking
-- Run once in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- 1. Monthly visitor snapshots on the competitors table
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS last_full_month_visits bigint;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS prior_month_visits bigint;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS visits_month text;  -- e.g. "2026-10"

-- 2. Coverage tracking for competitor best-sellers vs own products
CREATE TABLE IF NOT EXISTS product_coverage (
  id bigserial PRIMARY KEY,
  competitor_product_id bigint NOT NULL REFERENCES competitor_products(id) ON DELETE CASCADE,
  own_product_id bigint REFERENCES own_products(id) ON DELETE SET NULL,
  own_product_title text,
  status text NOT NULL DEFAULT 'not_covered' CHECK (status IN ('covered', 'partly_covered', 'not_covered')),
  auto_matched boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competitor_product_id)
);

ALTER TABLE product_coverage ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_coverage TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT ON product_coverage TO anon;

DO $$ BEGIN
  CREATE POLICY "anon_read_product_coverage" ON product_coverage FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
