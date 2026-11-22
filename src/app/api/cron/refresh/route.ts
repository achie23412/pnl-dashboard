import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { fetchShopifyRevenue, fetchMetaSpend, fetchTikTokSpend } from "@/lib/windsor"
import { fetchCogs } from "@/lib/shipgoods"

export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = getServiceClient()
  const { data: logRow } = await db.from("refresh_log").insert({ status: "running" }).select("id").single()
  const logId = logRow?.id

  try {
    const today = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

    const [revenue, metaSpend, tiktokSpend, cogs] = await Promise.all([
      fetchShopifyRevenue(from, today),
      fetchMetaSpend(from, today),
      fetchTikTokSpend(from, today),
      fetchCogs(from, today),
    ])

    const spend = [...metaSpend, ...tiktokSpend]

    if (revenue.length > 0) {
      await db.from("daily_revenue").upsert(revenue, { onConflict: "date,store" })
    }
    if (spend.length > 0) {
      await db.from("daily_spend").upsert(spend, { onConflict: "date,channel,account" })
    }
    if (cogs.length > 0) {
      await db.from("daily_cogs").upsert(cogs, { onConflict: "date,store" })
    }

    if (logId) {
      await db.from("refresh_log").update({
        completed_at: new Date().toISOString(),
        status: "success",
        revenue_rows: revenue.length,
        spend_rows: spend.length,
        cogs_rows: cogs.length,
      }).eq("id", logId)
    }

    return NextResponse.json({
      ok: true,
      revenue: revenue.length,
      spend: spend.length,
      cogs: cogs.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (logId) {
      await db.from("refresh_log").update({
        completed_at: new Date().toISOString(),
        status: "error",
        error: message,
      }).eq("id", logId)
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
