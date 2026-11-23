import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"

export const maxDuration = 30

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { competitors } = await req.json()
  if (!Array.isArray(competitors) || competitors.length === 0) {
    return NextResponse.json({ error: "competitors array required" }, { status: 400 })
  }

  const db = getServiceClient()

  const rows = competitors.map((c: Record<string, unknown>) => ({
    domain: c.domain,
    store_name: c.store_name || c.domain,
    store_url: c.store_url || `https://${c.domain}`,
    monthly_visits: c.monthly_visits ?? null,
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
  }))

  const { error } = await db
    .from("competitors")
    .upsert(rows, { onConflict: "domain" })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, synced: rows.length })
}
