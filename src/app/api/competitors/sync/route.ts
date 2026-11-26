import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"

export const maxDuration = 30

function lastFullMonth(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`
}

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { competitors } = await req.json()
  if (!Array.isArray(competitors) || competitors.length === 0) {
    return NextResponse.json({ error: "competitors array required" }, { status: 400 })
  }

  const db = getServiceClient()
  const lfm = lastFullMonth()

  const domains = competitors.map((c: Record<string, unknown>) => c.domain as string)
  const { data: existing } = await db
    .from("competitors")
    .select("domain, visits_month, last_full_month_visits, prior_month_visits")
    .in("domain", domains)

  const snap = new Map(
    (existing || []).map((e: Record<string, unknown>) => [
      e.domain as string,
      {
        visits_month: e.visits_month as string | null,
        last_full_month_visits: e.last_full_month_visits as number | null,
        prior_month_visits: e.prior_month_visits as number | null,
      },
    ]),
  )

  const rows = competitors.map((c: Record<string, unknown>) => {
    const ex = snap.get(c.domain as string)
    const monthlyVisits = (c.monthly_visits as number) ?? null

    let lfmVisits: number | null
    let priorVisits: number | null
    let visitsMonth: string | null

    if (!ex || ex.visits_month !== lfm) {
      priorVisits = ex?.last_full_month_visits ?? null
      lfmVisits = monthlyVisits
      visitsMonth = lfm
    } else {
      lfmVisits = ex.last_full_month_visits
      priorVisits = ex.prior_month_visits
      visitsMonth = ex.visits_month
    }

    return {
      domain: c.domain,
      store_name: c.store_name || c.domain,
      store_url: c.store_url || `https://${c.domain}`,
      monthly_visits: monthlyVisits,
      growth_30d: c.growth_30d ?? null,
      markets: c.markets || [],
      active_ads: c.active_ads ?? 0,
      products_count: c.products_count ?? null,
      est_monthly_revenue: c.est_monthly_revenue ?? null,
      est_units_sold: c.est_units_sold ?? null,
      trendtrack_id: c.trendtrack_id ?? null,
      niche: c.niche || "",
      status: c.status || "watching",
      last_synced: new Date().toISOString(),
      last_checked: new Date().toISOString().split("T")[0],
      last_full_month_visits: lfmVisits,
      prior_month_visits: priorVisits,
      visits_month: visitsMonth,
    }
  })

  const { error } = await db
    .from("competitors")
    .upsert(rows, { onConflict: "domain" })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, synced: rows.length, visits_month: lfm })
}
