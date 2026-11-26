import { NextRequest, NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { getServiceClient } from "@/lib/supabase"
import { getRole } from "@/lib/auth-role"
import { daysAgo } from "@/lib/product-complaints"
import { fetchLatestEurRates, STORE_CURRENCY } from "@/lib/currency"
import { merchantConfigured, serviceAccountEmail, registerGcp } from "@/lib/merchant-api"
import {
  GMC_STORES, amsterdamDay, mondayOf, getSettings, dailyLimit, usageToday, syncStore, markSyncError,
  isCounterfeit, productStatuses, accessScopes, requestChanges, howToFix, type GmcSettings,
} from "@/lib/gmc-health"
import { productStats30d } from "@/lib/gmc-health-stats"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const cachedStats = unstable_cache(productStats30d, ["gmc-health-stats"], { revalidate: 3600 })
const cachedScopes = unstable_cache(async () => {
  const out: Record<string, boolean> = {}
  for (const s of GMC_STORES) out[s] = (await accessScopes(s).catch(() => [] as string[])).indexOf("write_products") >= 0
  return out
}, ["gmc-health-scopes"], { revalidate: 3600 })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function selectAll(table: string, build: (q: any) => any, max = 10000) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let i = 0; i < max; i += 1000) {
    const { data, error } = await build(getServiceClient().from(table).select("*")).range(i, i + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

interface PriceRow {
  store: string; offer_id: string; product_id: string | null; variant_id: string | null; title: string | null
  price: number; suggested_price: number; currency: string; clicks: number | null; conversions: number | null
  effectiveness: string | null; cogs_local: number | null; cogs_source: string | null
  cog_pct_now: number | null; cog_pct_new: number | null; status: "ok" | "blocked" | "no_cogs"
}

// Google's lower-price suggestions with the COG% each new price would reach.
// COGS (USD) comes from the 90-day product catalog and is converted to the price's currency.
async function buildPriceRows(settings: GmcSettings[], origin: string, cookie: string): Promise<{ rows: PriceRow[]; error: string | null }> {
  const insights = await selectAll("gmc_price_insights", (q) => q.order("store"))
  if (!insights.length) return { rows: [], error: null }
  let error: string | null = null
  const cogs: Record<string, { usd: number; source: string }> = {}
  try {
    const r = await fetch(`${origin}/api/product-catalog?store=all&from=${daysAgo(89)}&to=${daysAgo(0)}`, { headers: { cookie }, cache: "no-store", signal: AbortSignal.timeout(40000) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
    for (const p of j.products || []) {
      if (p.cogs_usd == null || !(p.cogs_usd > 0)) continue
      for (const id of p.product_ids || []) cogs[`${p.store}|${id}`] = { usd: p.cogs_usd, source: p.cogs_source }
    }
  } catch (e) {
    error = `COGS couldn't be loaded: ${e instanceof Error ? e.message : String(e)}`
  }
  const rates = await fetchLatestEurRates()
  const usdTo: Record<string, number> = { USD: 1, EUR: 1 / rates.USD, GBP: rates.GBP / rates.USD }
  const rows: PriceRow[] = insights.map((x) => {
    const s = settings.find((y) => y.store === x.store)
    const cur = x.currency || STORE_CURRENCY[x.store] || "EUR"
    const c = x.product_id ? cogs[`${x.store}|${x.product_id}`] : undefined
    const local = c && usdTo[cur] ? c.usd * usdTo[cur] : null
    const pctNew = local != null ? Math.round((local / Number(x.suggested_price)) * 1000) / 10 : null
    const pctNow = local != null ? Math.round((local / Number(x.price)) * 1000) / 10 : null
    const max = Number(s?.max_cog_pct ?? 30)
    return {
      store: x.store, offer_id: x.offer_id, product_id: x.product_id, variant_id: x.variant_id, title: x.title,
      price: Number(x.price), suggested_price: Number(x.suggested_price), currency: cur,
      clicks: x.predicted_clicks_change, conversions: x.predicted_conversions_change, effectiveness: x.effectiveness,
      cogs_local: local != null ? Math.round(local * 100) / 100 : null, cogs_source: c?.source ?? null,
      cog_pct_now: pctNow, cog_pct_new: pctNew,
      status: pctNew == null ? "no_cogs" : pctNew <= max ? "ok" : "blocked",
    }
  })
  return { rows, error }
}

export async function GET(req: NextRequest) {
  try {
    const db = getServiceClient()
    const today = amsterdamDay()
    const settings = await getSettings()
    const [issues, changes, queued] = await Promise.all([
      selectAll("gmc_issues", (q) => q.is("resolved_on", null).eq("severity", "DISAPPROVED").order("first_seen")),
      selectAll("feed_changes", (q) => q.gte("planned_for", daysAgo(14)).order("created_at", { ascending: false }), 2000),
      selectAll("feed_changes", (q) => q.eq("status", "queued")),
    ])
    const firstSync: Record<string, string> = {}
    for (const s of GMC_STORES) {
      const { data } = await db.from("gmc_issues").select("first_seen").eq("store", s).order("first_seen").limit(1)
      if (data?.[0]) firstSync[s] = data[0].first_seen
    }
    const stores = await Promise.all(settings.map(async (s) => ({
      ...s,
      limit: dailyLimit(s),
      ...(await usageToday(s.store)),
      queued: queued.filter((q) => q.store === s.store).length,
    })))

    let stats: Record<string, { spend: number; units: number; revenue_eur: number }> = {}
    let statsError: string | null = null
    if (issues.length) {
      try { stats = await cachedStats() } catch (e) { statsError = e instanceof Error ? e.message : String(e) }
    }

    // Counterfeit: one row per product, with its Shopify status and whether a draft is already logged
    const cf: Record<string, { store: string; product_id: string; title: string | null; offers: string[]; first_seen: string; description: string | null }> = {}
    for (const i of issues) {
      if (!isCounterfeit(i) || !i.product_id) continue
      const k = `${i.store}|${i.product_id}`
      const ex = cf[k]
      if (ex) { if (ex.offers.indexOf(i.offer_id) < 0) ex.offers.push(i.offer_id); if (i.first_seen < ex.first_seen) ex.first_seen = i.first_seen; continue }
      cf[k] = { store: i.store, product_id: i.product_id, title: i.title, offers: [i.offer_id], first_seen: i.first_seen, description: i.description }
    }
    const cfList = Object.keys(cf).map((k) => cf[k])
    const statuses: Record<string, string> = {}
    let statusError: string | null = null
    for (const s of GMC_STORES) {
      const ids = cfList.filter((c) => c.store === s).map((c) => c.product_id)
      if (!ids.length) continue
      try {
        const st = await productStatuses(s, ids)
        for (const id of Object.keys(st)) statuses[`${s}|${id}`] = st[id]
      } catch (e) { statusError = e instanceof Error ? e.message : String(e) }
    }
    const draftLog = changes.filter((c) => c.kind === "draft" && (c.status === "queued" || c.status === "applied"))
    const counterfeit = cfList.map((c) => {
      const log = draftLog.find((d) => d.store === c.store && d.product_id === c.product_id)
      return { ...c, shopify_status: statuses[`${c.store}|${c.product_id}`] || null, draft: log ? { status: log.status, planned_for: log.planned_for } : null, stats: stats[`${c.store}|${c.product_id}`] || null }
    })

    const origin = req.nextUrl.origin
    const price = await buildPriceRows(settings, origin, req.headers.get("cookie") || "")
      .catch((e) => ({ rows: [] as PriceRow[], error: e instanceof Error ? e.message : String(e) }))

    const scopes = await cachedScopes().catch(() => ({} as Record<string, boolean>))

    return NextResponse.json({
      configured: merchantConfigured(),
      service_account: serviceAccountEmail(),
      today, monday: mondayOf(today),
      stores: stores.map((s) => ({ ...s, write_products: scopes[s.store] ?? null, first_sync: firstSync[s.store] || null })),
      issues: issues.map((i) => ({ ...i, fix: howToFix(i.issue_code, i.description), counterfeit: isCounterfeit(i), stats: i.product_id ? stats[`${i.store}|${i.product_id}`] || null : null })),
      stats_error: statsError,
      counterfeit, status_error: statusError,
      price_rows: price.rows, price_error: price.error,
      changes,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const missing = /gmc_|feed_changes/.test(msg) && /not find|does not exist|schema cache/i.test(msg)
    return NextResponse.json({ error: missing ? "The GMC Health tables don't exist yet. Run supabase/gmc-health.sql in Supabase." : msg }, { status: 500 })
  }
}

// Owner actions: settings, sync, register, draft, price, cancel
export async function POST(req: NextRequest) {
  if ((await getRole()) !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const db = getServiceClient()
  try {
    if (b.action === "settings") {
      if (GMC_STORES.indexOf(b.store) < 0) return NextResponse.json({ error: "Unknown store" }, { status: 400 })
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (b.merchant_id !== undefined) {
        const id = String(b.merchant_id || "").replace(/\D/g, "")
        patch.merchant_id = id || null
      }
      if (b.max_cog_pct !== undefined) { const v = Number(b.max_cog_pct); if (!(v > 0 && v < 100)) return NextResponse.json({ error: "COG% must be between 0 and 100" }, { status: 400 }); patch.max_cog_pct = v }
      if (b.feed_change_pct !== undefined) { const v = Number(b.feed_change_pct); if (!(v > 0 && v <= 100)) return NextResponse.json({ error: "Feed limit must be between 0 and 100%" }, { status: 400 }); patch.feed_change_pct = v }
      if (b.max_drafts_per_day !== undefined) { const v = Math.round(Number(b.max_drafts_per_day)); if (!(v >= 0)) return NextResponse.json({ error: "Max drafts must be 0 or more" }, { status: 400 }); patch.max_drafts_per_day = v }
      const { error } = await db.from("gmc_settings").update(patch).eq("store", b.store)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    if (b.action === "sync") {
      const settings = (await getSettings()).filter((s) => s.merchant_id)
      if (!settings.length) return NextResponse.json({ error: "Fill in the Merchant Center IDs first" }, { status: 400 })
      const results = await Promise.all(settings.map((s) => syncStore(s).catch(async (e) => {
        const msg = e instanceof Error ? e.message : String(e)
        await markSyncError(s.store, msg)
        return { store: s.store, error: msg }
      })))
      return NextResponse.json({ ok: true, results })
    }
    if (b.action === "register") {
      const s = (await getSettings()).find((x) => x.store === b.store)
      const email = String(b.email || "").trim()
      if (!s?.merchant_id) return NextResponse.json({ error: "Fill in this store's Merchant Center ID first" }, { status: 400 })
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Fill in your Google account email" }, { status: 400 })
      await registerGcp(s.merchant_id, email)
      return NextResponse.json({ ok: true })
    }
    if (b.action === "draft") {
      const items: { store: string; product_id: string; title?: string }[] = Array.isArray(b.items) ? b.items.slice(0, 200) : []
      // Only products with an open counterfeit disapproval
      const ok: typeof items = []
      for (const it of items) {
        const { data } = await db.from("gmc_issues").select("issue_code,description").eq("store", it.store)
          .eq("product_id", String(it.product_id)).is("resolved_on", null)
        if ((data || []).some((d) => isCounterfeit(d))) ok.push(it)
      }
      const results = await requestChanges(ok.map((it) => ({ store: it.store, product_id: String(it.product_id), title: it.title || null, kind: "draft" as const, reason: "GMC: counterfeit" })), "owner")
      return NextResponse.json({ ok: true, results, skipped: items.length - ok.length })
    }
    if (b.action === "price") {
      const items: { store: string; offer_id: string }[] = Array.isArray(b.items) ? b.items.slice(0, 200) : []
      const settings = await getSettings()
      const { rows } = await buildPriceRows(settings, req.nextUrl.origin, req.headers.get("cookie") || "")
      const allowed = items.map((it) => rows.find((r) => r.store === it.store && r.offer_id === it.offer_id)).filter((r): r is PriceRow => !!r && r.status === "ok" && !!r.product_id && !!r.variant_id)
      const results = await requestChanges(allowed.map((r) => ({
        store: r.store, product_id: r.product_id as string, variant_id: r.variant_id, title: r.title, kind: "price" as const,
        new_value: r.suggested_price.toFixed(2), reason: `GMC price suggestion (COG% ${r.cog_pct_new}%)`,
      })), "owner")
      return NextResponse.json({ ok: true, results, skipped: items.length - allowed.length })
    }
    if (b.action === "cancel") {
      const { error } = await db.from("feed_changes").update({ status: "cancelled" }).eq("id", Number(b.id)).eq("status", "queued")
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
