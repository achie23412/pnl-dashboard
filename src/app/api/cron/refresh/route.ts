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

    const errors: string[] = []

    const [revenueResult, metaResult, tiktokResult, cogsResult] = await Promise.allSettled([
      fetchShopifyRevenue(from, today),
      fetchMetaSpend(from, today),
      fetchTikTokSpend(from, today),
      fetchCogs(from, today),
    ])

    const revenue = revenueResult.status === "fulfilled" ? revenueResult.value : (errors.push(`Shopify: ${revenueResult.reason}`), [])
    const metaSpend = metaResult.status === "fulfilled" ? metaResult.value : (errors.push(`Meta: ${metaResult.reason}`), [])
    const tiktokSpend = tiktokResult.status === "fulfilled" ? tiktokResult.value : (errors.push(`TikTok: ${tiktokResult.reason}`), [])
    const cogs = cogsResult.status === "fulfilled" ? cogsResult.value : (errors.push(`COGS: ${cogsResult.reason}`), [])

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
        status: errors.length > 0 ? "partial" : "success",
        revenue_rows: revenue.length,
        spend_rows: spend.length,
        cogs_rows: cogs.length,
        error: errors.length > 0 ? errors.join("; ") : null,
      }).eq("id", logId)
    }

    return NextResponse.json({
      ok: errors.length === 0,
      revenue: revenue.length,
      spend: spend.length,
      cogs: cogs.length,
      errors: errors.length > 0 ? errors : undefined,
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
