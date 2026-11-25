import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { fetchShopifyRevenue, fetchMetaSpend, fetchTikTokSpend, fetchGoogleAdsSpend } from "@/lib/windsor"
import { fetchShopifyRevenueDirect } from "@/lib/shopify-direct"
import { fetchShopifySessions, hasAnySessionsCredentials } from "@/lib/shopify-sessions"
import { fetchCogs } from "@/lib/shipgoods"
import { estimateGoogleStoreCogs } from "@/lib/launch-sheet-cogs"

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

    // Revenue stays on Windsor; Shopify tokens are only used for sessions (CVR)
    // unless direct revenue is switched on explicitly.
    const useDirectShopify = process.env.USE_SHOPIFY_DIRECT_REVENUE === "1"
    const revenueFetcher = useDirectShopify ? fetchShopifyRevenueDirect : fetchShopifyRevenue

    const [revenueResult, metaResult, tiktokResult, googleResult, cogsResult, sessionsResult] = await Promise.allSettled([
      revenueFetcher(from, today),
      fetchMetaSpend(from, today),
      fetchTikTokSpend(from, today),
      fetchGoogleAdsSpend(from, today),
      fetchCogs(from, today),
      hasAnySessionsCredentials() ? fetchShopifySessions(from, today) : Promise.resolve({ rows: [], errors: [] }),
    ])

    const revenue = revenueResult.status === "fulfilled" ? revenueResult.value : (errors.push(`Shopify${useDirectShopify ? " Direct" : ""}: ${revenueResult.reason}`), [])
    const metaSpend = metaResult.status === "fulfilled" ? metaResult.value : (errors.push(`Meta: ${metaResult.reason}`), [])
    const tiktokSpend = tiktokResult.status === "fulfilled" ? tiktokResult.value : (errors.push(`TikTok: ${tiktokResult.reason}`), [])
    const googleSpend = googleResult.status === "fulfilled" ? googleResult.value : (errors.push(`Google Ads: ${googleResult.reason}`), [])
    const cogs = cogsResult.status === "fulfilled" ? cogsResult.value : (errors.push(`COGS: ${cogsResult.reason}`), [])

    const spend = [...metaSpend, ...tiktokSpend, ...googleSpend]

    if (revenue.length > 0) {
      await db.from("daily_revenue").upsert(revenue, { onConflict: "date,store" })
    }
    if (spend.length > 0) {
      await db.from("daily_spend").upsert(spend, { onConflict: "date,channel,account" })
    }
    if (cogs.length > 0) {
      await db.from("daily_cogs").upsert(cogs, { onConflict: "date,store" })
    }

    // Estimate COGS for Google stores using launch sheet averages
    let estCogsRows = 0
    try {
      const cogsDateStores = new Set(cogs.map((c) => `${c.date}|${c.store}`))
      const revenueForEstimate = revenue.filter(
        (r) => r.orders > 0 && !cogsDateStores.has(`${r.date}|${r.store}`),
      )
      if (revenueForEstimate.length > 0) {
        const estimated = await estimateGoogleStoreCogs(revenueForEstimate)
        if (estimated.length > 0) {
          const { error } = await db.from("daily_cogs").upsert(
            estimated.map((e) => ({ date: e.date, store: e.store, cogs: e.cogs })),
            { onConflict: "date,store", ignoreDuplicates: true },
          )
          if (error) errors.push(`Est COGS: ${error.message}`)
          else estCogsRows = estimated.length
        }
      }
    } catch (e: unknown) {
      errors.push(`Est COGS: ${e instanceof Error ? e.message : String(e)}`)
    }

    let sessionRows = 0
    if (sessionsResult.status === "fulfilled") {
      for (const e of sessionsResult.value.errors) errors.push(`Sessions ${e}`)
      if (sessionsResult.value.rows.length > 0) {
        const { error } = await db.from("daily_sessions").upsert(sessionsResult.value.rows, { onConflict: "date,store" })
        if (error) errors.push(`Sessions save: ${error.message}`)
        else sessionRows = sessionsResult.value.rows.length
      }
    } else {
      errors.push(`Sessions: ${sessionsResult.reason}`)
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
      sessions: sessionRows,
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
