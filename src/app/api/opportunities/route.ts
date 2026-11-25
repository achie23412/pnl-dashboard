import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { recomputeOpportunities, selectAll, ACTIVE_WINDOW_DAYS } from "@/lib/opportunity-db"
import { patternSummary, type CompetitorProduct } from "@/lib/opportunity-engine"

export const maxDuration = 60

const SETUP_HINT = "Run supabase/opportunities.sql in the Supabase SQL editor first."

function isMissingTable(msg: string) {
  return /relation .* does not exist|Could not find the table|schema cache/i.test(msg)
}

export async function GET() {
  const db = getServiceClient()
  try {
    const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
    const [opps, products, jobs, scan] = await Promise.all([
      selectAll<Record<string, unknown>>(db, "opportunities", "*", (q) => q.order("updated_at", { ascending: false })),
      selectAll<CompetitorProduct>(db, "competitor_products", "competitor_domain,title,product_type,price,currency,published_at,first_seen,last_seen", (q) => q.gte("last_seen", since)),
      db.from("import_jobs").select("*").order("updated_at", { ascending: false }).limit(300),
      db.from("competitor_products").select("last_seen").order("last_seen", { ascending: false }).limit(1),
    ])
    if (jobs.error) throw new Error(jobs.error.message)
    return NextResponse.json({
      opportunities: opps,
      patterns: patternSummary(products),
      jobs: jobs.data || [],
      scan: {
        products_in_window: products.length,
        competitors_in_window: new Set(products.map((p) => p.competitor_domain)).size,
        last_scan: scan.data?.[0]?.last_seen || null,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: isMissingTable(msg) ? `Tables missing. ${SETUP_HINT}` : msg, setup_needed: isMissingTable(msg) }, { status: 500 })
  }
}

// POST {action: "recompute"}: rebuild opportunities from the latest scan.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: string }
  if (body.action !== "recompute") return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  try {
    const result = await recomputeOpportunities(getServiceClient())
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: isMissingTable(msg) ? `Tables missing. ${SETUP_HINT}` : msg }, { status: 500 })
  }
}
