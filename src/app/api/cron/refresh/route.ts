import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { fetchShopifyRevenueAndRefunds, fetchMetaSpend, fetchTikTokSpend, fetchGoogleAdsSpend } from "@/lib/windsor"
import { metaDirectConfigured, fetchMetaSpendDirect } from "@/lib/meta-direct"
import { fetchShopifyDirect } from "@/lib/shopify-direct"
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

    // Revenue, orders and refunds come straight from each store's Shopify API (no Windsor
    // needed). A store that fails falls back to Windsor's Shopify data for that store.
    // USE_WINDSOR_REVENUE=1 switches everything back to Windsor.
    const useWindsorRevenue = process.env.USE_WINDSOR_REVENUE === "1"
    const revenueFetcher = async (f: string, t: string) => {
      if (useWindsorRevenue) {
        const w = await fetchShopifyRevenueAndRefunds(f, t)
        return { ...w, stores: null as string[] | null, notes: [] as string[] }
      }
      const d = await fetchShopifyDirect(f, t)
      const notes = d.failed.map((x) => `Shopify ${x.store}: ${x.error}`)
      let revenue = d.revenue
      let refunds = d.refunds
      const stores = [...d.okStores]
      if (d.failed.length) {
        const failed = new Set(d.failed.map((x) => x.store))
        try {
          const w = await fetchShopifyRevenueAndRefunds(f, t)
          const wRev = w.revenue.filter((r) => failed.has(r.store))
          const wRef = w.refunds.filter((r) => failed.has(r.store))
          revenue = [...revenue, ...wRev]
          refunds = [...refunds, ...wRef]
          // Only replace a failed store's rows when Windsor actually has data for it
          for (const s of Array.from(failed)) if (wRev.some((r) => r.store === s) || wRef.some((r) => r.store === s)) stores.push(s)
          notes.push(`Windsor used for ${Array.from(failed).join(", ")}`)
        } catch (e) {
          notes.push(`Windsor fallback: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      if (!stores.length) throw new Error(notes.join("; ") || "no store returned data")
      return { revenue, refunds, stores, notes }
    }

    const [revenueResult, metaResult, tiktokResult, googleResult, cogsResult, sessionsResult] = await Promise.allSettled([
      revenueFetcher(from, today),
      // Meta straight from the Marketing API when META_ACCESS_TOKEN is set; Windsor if that fails
      metaDirectConfigured()
        ? fetchMetaSpendDirect(from, today).catch((e) => {
            errors.push(`Meta direct failed, Windsor used: ${e instanceof Error ? e.message : String(e)}`)
            return fetchMetaSpend(from, today)
          })
        : fetchMetaSpend(from, today),
      fetchTikTokSpend(from, today),
      fetchGoogleAdsSpend(from, today),
      fetchCogs(from, today),
      hasAnySessionsCredentials() ? fetchShopifySessions(from, today) : Promise.resolve({ rows: [], errors: [] }),
    ])

    const revenue = revenueResult.status === "fulfilled" ? revenueResult.value.revenue : (errors.push(`Shopify revenue: ${revenueResult.reason}`), [])
    const shopifyRefunds = revenueResult.status === "fulfilled" ? revenueResult.value.refunds : null
    // Stores whose revenue/refunds were read this run (null = all, when Windsor is the source)
    const revenueStores = revenueResult.status === "fulfilled" ? revenueResult.value.stores : null
    if (revenueResult.status === "fulfilled") errors.push(...revenueResult.value.notes)
    const metaSpend = metaResult.status === "fulfilled" ? metaResult.value : (errors.push(`Meta: ${metaResult.reason}`), [])
    const tiktokSpend = tiktokResult.status === "fulfilled" ? tiktokResult.value : (errors.push(`TikTok: ${tiktokResult.reason}`), [])
    const googleSpend = googleResult.status === "fulfilled" ? googleResult.value : (errors.push(`Google Ads: ${googleResult.reason}`), [])
    const cogs = cogsResult.status === "fulfilled" ? cogsResult.value : (errors.push(`COGS: ${cogsResult.reason}`), [])

    const spend = [...metaSpend, ...tiktokSpend, ...googleSpend]

    if (revenueStores?.length) {
      // Shopify dates follow each store's timezone; clear the window first so a day that now has
      // no orders doesn't keep an old value from the previous source
      const { error: delErr } = await db.from("daily_revenue").delete().in("store", revenueStores).gte("date", from).lte("date", today)
      if (delErr) errors.push(`Revenue clear: ${delErr.message}`)
    }
    if (revenue.length > 0) {
      const { error: revErr } = await db.from("daily_revenue").upsert(revenue, { onConflict: "date,store" })
      if (revErr) errors.push(`Revenue save: ${revErr.message}`)
    }
    if (spend.length > 0) {
      await db.from("daily_spend").upsert(spend, { onConflict: "date,channel,account" })
    }
    if (cogs.length > 0) {
      await db.from("daily_cogs").upsert(cogs, { onConflict: "date,store" })
    }

    // Shopify refunds: replace the window's shopify-sourced rows (the refunds
    // table has no unique key, so delete + insert keeps the refresh idempotent).
    // Manual refunds are left alone.
    let refundRows = 0
    if (shopifyRefunds) {
      let del = db.from("refunds").delete().eq("source", "shopify").gte("date", from).lte("date", today)
      if (revenueStores) del = del.in("store", revenueStores)
      const { error: delErr } = await del
      if (delErr) {
        errors.push(`Refunds delete: ${delErr.message}`)
      } else if (shopifyRefunds.length > 0) {
        const { error: insErr } = await db.from("refunds").insert(
          shopifyRefunds.map((r) => ({
            date: r.date,
            store: r.store,
            order_id: r.order_id,
            amount: r.amount,
            reason: `Shopify refund ${r.refund_id.split("/").pop()}`,
            source: "shopify",
            status: "refunded",
          })),
        )
        if (insErr) errors.push(`Refunds insert: ${insErr.message}`)
        else refundRows = shopifyRefunds.length
      }
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
      refunds: refundRows,
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
