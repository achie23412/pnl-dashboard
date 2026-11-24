import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  const { error } = await supabase.rpc("exec_sql", {
    query: `
      CREATE TABLE IF NOT EXISTS product_tests (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        product_name TEXT NOT NULL,
        store TEXT NOT NULL,
        launch_date DATE NOT NULL,
        status TEXT DEFAULT 'testing',
        daily_budget NUMERIC DEFAULT 30,
        total_spend NUMERIC DEFAULT 0,
        total_revenue NUMERIC DEFAULT 0,
        total_orders INTEGER DEFAULT 0,
        total_atc INTEGER DEFAULT 0,
        total_clicks INTEGER DEFAULT 0,
        avg_cpc NUMERIC DEFAULT 0,
        today_spend NUMERIC DEFAULT 0,
        today_revenue NUMERIC DEFAULT 0,
        today_orders INTEGER DEFAULT 0,
        yesterday_spend NUMERIC DEFAULT 0,
        yesterday_revenue NUMERIC DEFAULT 0,
        yesterday_orders INTEGER DEFAULT 0,
        cogs_per_order NUMERIC DEFAULT 0,
        notes TEXT DEFAULT '',
        kill_reason TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE product_tests ENABLE ROW LEVEL SECURITY;

      CREATE POLICY IF NOT EXISTS "Allow all for anon" ON product_tests
        FOR ALL TO anon USING (true) WITH CHECK (true);
    `,
  })

  if (error) {
    // rpc may not exist, fall back to raw insert to test if table exists
    const { error: testError } = await supabase
      .from("product_tests")
      .select("id")
      .limit(1)

    if (testError) {
      return NextResponse.json(
        {
          error: "Table creation requires running SQL in Supabase dashboard",
          sql: `CREATE TABLE IF NOT EXISTS product_tests (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  product_name TEXT NOT NULL,
  store TEXT NOT NULL,
  launch_date DATE NOT NULL,
  status TEXT DEFAULT 'testing',
  daily_budget NUMERIC DEFAULT 30,
  total_spend NUMERIC DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_atc INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  avg_cpc NUMERIC DEFAULT 0,
  today_spend NUMERIC DEFAULT 0,
  today_revenue NUMERIC DEFAULT 0,
  today_orders INTEGER DEFAULT 0,
  yesterday_spend NUMERIC DEFAULT 0,
  yesterday_revenue NUMERIC DEFAULT 0,
  yesterday_orders INTEGER DEFAULT 0,
  cogs_per_order NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  kill_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE product_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON product_tests
  FOR ALL TO anon USING (true) WITH CHECK (true);`,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, message: "Table already exists" })
  }

  return NextResponse.json({ ok: true })
}
