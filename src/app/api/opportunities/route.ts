import { NextRequest, NextResponse } from "next/server"
import { revalidateTag, unstable_cache } from "next/cache"
import { getServiceClient } from "@/lib/supabase"
import { recomputeOpportunities, selectAll, ACTIVE_WINDOW_DAYS } from "@/lib/opportunity-db"
import { patternSummary, type CompetitorProduct } from "@/lib/opportunity-engine"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const SETUP_HINT = "Run supabase/opportunities.sql in the Supabase SQL editor first."
const PATTERNS_TAG = "opportunity-patterns"

function isMissingTable(msg: string) {
  return /relation .* does not exist|Could not find the table|schema cache/i.test(msg)
}

// Patterns + scan summary read ~9k competitor products, so they are cached
// (1 hour, and cleared whenever opportunities are rebuilt).
const getPatterns = unstable_cache(
  async () => {
    const db = getServiceClient()
    const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
    const [products, scan] = await Promise.all([
      selectAll<CompetitorProduct>(db, "competitor_products", "competitor_domain,title,product_type,price,currency,published_at,first_seen,last_seen", (q) => q.gte("last_seen", since)),
      db.from("competitor_products").select("last_seen").order("last_seen", { ascending: false }).limit(1),
    ])
    return {
      patterns: patternSummary(products),
      scan: {
        products_in_window: products.length,
        competitors_in_window: new Set(products.map((p) => p.competitor_domain)).size,
        last_scan: (scan.data?.[0]?.last_seen as string | undefined) || null,
      },
    }
  },
  ["opportunity-patterns-v1"],
  { revalidate: 3600, tags: [PATTERNS_TAG] },
)

export async function GET() {
  const db = getServiceClient()
  try {
    const [opps, jobs, summary] = await Promise.all([
      selectAll<Record<string, unknown>>(db, "opportunities", "*", (q) => q.order("updated_at", { ascending: false })),
      db.from("import_jobs").select("*").order("updated_at", { ascending: false }).limit(300),
      getPatterns(),
    ])
    if (jobs.error) throw new Error(jobs.error.message)
    // List view stays light: evidence (titles, images, prices of every source)
    // and the long explanations are loaded per item from /api/opportunities/[id]
    // when a card is opened.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const light = opps.map(({ evidence, observations, inferences, data_gaps, priority_reason, timing_note, ...o }) => ({
      ...o,
      competitor_domains: Array.from(new Set(((evidence as { competitor_domain: string }[]) || []).map((e) => e.competitor_domain))),
      first_source_url: ((evidence as { url: string }[]) || [])[0]?.url || null,
    }))
    return NextResponse.json({ opportunities: light, jobs: jobs.data || [], ...summary })
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
    revalidateTag(PATTERNS_TAG)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: isMissingTable(msg) ? `Tables missing. ${SETUP_HINT}` : msg }, { status: 500 })
  }
}
