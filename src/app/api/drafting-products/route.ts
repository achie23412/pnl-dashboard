import { NextResponse } from "next/server"
import { fetchGoogleProductDaily } from "@/lib/windsor"
import { SHOPIFY_STORES } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"
import { getServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const GOOGLE_STORES = ["Walsh & Farley", "Carter & Collins", "Susan & Allen"]
const SPEND_THRESHOLD_EUR = 30

const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)
const round2 = (n: number) => Math.round(n * 100) / 100

interface ProductMetrics {
  spend_7d: number; spend_14d: number; spend_30d: number
  clicks_7d: number; clicks_14d: number; clicks_30d: number
  cpc_30d: number
  sales_7d: number; sales_14d: number; sales_30d: number
  revenue_7d: number; revenue_14d: number; revenue_30d: number
  roas_7d: number; roas_14d: number; roas_30d: number
}

export interface DraftingCandidate {
  store: string
  product_id: string
  product_title: string
  rule_number: number
  rule_type: "hard" | "review"
  action: "draft" | "raise_price" | "keep"
  reason: string
  metrics: ProductMetrics
}

interface ShopifyLineItem {
  product_id?: number | null
  title: string
  quantity: number
  price: string
}

interface ShopifyOrder {
  created_at: string
  line_items: ShopifyLineItem[]
  cancelled_at: string | null
}

interface SalesAccum {
  sales_7d: number; sales_14d: number; sales_30d: number
  revenue_7d: number; revenue_14d: number; revenue_30d: number
  title: string
}

async function fetchStoreSales(
  store: string,
  from30: string,
  from14: string,
  from7: string,
  to: string,
): Promise<Map<string, SalesAccum>> {
  const cfg = SHOPIFY_STORES[store]
  if (!cfg) return new Map()
  const token = await getShopifyToken(cfg.domain, cfg.envKey)
  if (!token) return new Map()

  const byProduct = new Map<string, SalesAccum>()
  let url: string | null =
    `https://${cfg.domain}/admin/api/2024-10/orders.json?status=any&created_at_min=${from30}T00:00:00Z&created_at_max=${to}T23:59:59Z&limit=250&fields=created_at,line_items,cancelled_at`
  let pages = 0

  while (url && pages < 10) {
    pages++
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) break
    const data = await res.json()
    for (const order of (data.orders || []) as ShopifyOrder[]) {
      if (order.cancelled_at) continue
      const d = order.created_at.slice(0, 10)
      for (const item of order.line_items) {
        if (!item.product_id) continue
        const key = String(item.product_id)
        const s = byProduct.get(key) || { sales_7d: 0, sales_14d: 0, sales_30d: 0, revenue_7d: 0, revenue_14d: 0, revenue_30d: 0, title: "" }
        const qty = item.quantity
        const rev = parseFloat(item.price) * qty
        s.sales_30d += qty
        s.revenue_30d += rev
        if (d >= from14) { s.sales_14d += qty; s.revenue_14d += rev }
        if (d >= from7) { s.sales_7d += qty; s.revenue_7d += rev }
        if (!s.title) s.title = item.title
        byProduct.set(key, s)
      }
    }
    const link = res.headers.get("link")
    const next = link?.match(/<([^>]+)>;\s*rel="next"/)
    url = next ? next[1] : null
  }
  return byProduct
}

function evaluateRules(
  store: string,
  productId: string,
  title: string,
  m: ProductMetrics,
): DraftingCandidate[] {
  const results: DraftingCandidate[] = []
  const base = { store, product_id: productId, product_title: title, metrics: m }

  // --- Hard rules (rules 1-3 need published_at, skipped) ---

  // Rule 4: Has sold + spend >= €50 + ROAS < 1 (approximated with 30d data)
  if (m.sales_30d > 0 && m.spend_30d >= 50 && m.roas_30d < 1 && m.roas_30d > 0) {
    results.push({
      ...base,
      rule_number: 4,
      rule_type: "hard",
      action: "draft",
      reason: `Has ${m.sales_30d} sales but ROAS ${m.roas_30d.toFixed(2)} on €${round2(m.spend_30d)} spend (30d)`,
    })
  }

  // Rule 5: 30d spend >= €10 + ROAS < 1 + CPC > €1.05 + no sale in 14d
  if (m.spend_30d >= 10 && m.roas_30d < 1 && m.cpc_30d > 1.05 && m.sales_14d === 0) {
    results.push({
      ...base,
      rule_number: 5,
      rule_type: "hard",
      action: "draft",
      reason: `CPC €${m.cpc_30d.toFixed(2)} + ROAS ${m.roas_30d.toFixed(2)} + 0 sales in 14d`,
    })
  }

  // --- Review rules: only products with 30d spend >= threshold AND 30d ROAS <= 2.2 ---
  if (m.spend_30d < SPEND_THRESHOLD_EUR || m.roas_30d > 2.2) return results

  // Rule 6: Uptrend (ROAS rises 30→14→7d) → Keep
  if (m.roas_7d > m.roas_14d && m.roas_14d > m.roas_30d && m.roas_7d > 0) {
    results.push({
      ...base,
      rule_number: 6,
      rule_type: "review",
      action: "keep",
      reason: `ROAS uptrend: 30d ${m.roas_30d.toFixed(2)} → 14d ${m.roas_14d.toFixed(2)} → 7d ${m.roas_7d.toFixed(2)}`,
    })
    return results
  }

  // Rule 7: ROAS < 2 over 7d or 14d + >= €100 spend → Draft
  if ((m.roas_7d < 2 || m.roas_14d < 2) && m.spend_30d >= 100) {
    results.push({
      ...base,
      rule_number: 7,
      rule_type: "review",
      action: "draft",
      reason: `ROAS 7d ${m.roas_7d.toFixed(2)} / 14d ${m.roas_14d.toFixed(2)} on €${round2(m.spend_30d)} spend`,
    })
    return results
  }

  // Rule 8: 30d ROAS < 1.7 → Draft
  if (m.roas_30d < 1.7) {
    results.push({
      ...base,
      rule_number: 8,
      rule_type: "review",
      action: "draft",
      reason: `30d ROAS ${m.roas_30d.toFixed(2)} < 1.7`,
    })
    return results
  }

  // Rule 9: Downtrend + 30d ROAS 1.7-2.2 → Raise price
  const downtrend = m.roas_7d < m.roas_14d && m.roas_14d < m.roas_30d
  if (downtrend && m.roas_30d >= 1.7 && m.roas_30d <= 2.2) {
    results.push({
      ...base,
      rule_number: 9,
      rule_type: "review",
      action: "raise_price",
      reason: `Downtrend: 30d ${m.roas_30d.toFixed(2)} → 14d ${m.roas_14d.toFixed(2)} → 7d ${m.roas_7d.toFixed(2)}. Raise price ≥10%`,
    })
    return results
  }

  // Rule 10: No sale in 14d + 7d spend not rising → Draft
  const spend7dDaily = m.spend_7d / 7
  const spend14dDaily = m.spend_14d / 14
  if (m.sales_14d === 0 && spend7dDaily <= spend14dDaily) {
    results.push({
      ...base,
      rule_number: 10,
      rule_type: "review",
      action: "draft",
      reason: `No sale in 14d, 7d avg spend €${round2(spend7dDaily)}/d vs 14d avg €${round2(spend14dDaily)}/d`,
    })
    return results
  }

  // Rule 11: None of above → Keep
  results.push({
    ...base,
    rule_number: 11,
    rule_type: "review",
    action: "keep",
    reason: "No review rule triggered → keep",
  })
  return results
}

export async function GET() {
  const from30 = day(29)
  const from14 = day(13)
  const from7 = day(6)
  const to = day(0)
  const errors: string[] = []

  const [dailyData, ...storeSales] = await Promise.all([
    fetchGoogleProductDaily(from30, to),
    ...GOOGLE_STORES.map((s) =>
      fetchStoreSales(s, from30, from14, from7, to).catch((e) => {
        errors.push(`${s}: ${e instanceof Error ? e.message : String(e)}`)
        return new Map<string, SalesAccum>()
      }),
    ),
  ])

  const salesByStore: Record<string, Map<string, SalesAccum>> = {}
  GOOGLE_STORES.forEach((s, i) => { salesByStore[s] = storeSales[i] })

  const products = new Map<string, { store: string; id: string; title: string; days: { date: string; spend: number; clicks: number }[] }>()
  for (const d of dailyData) {
    const key = `${d.store}|${d.productId}`
    const p = products.get(key) || { store: d.store, id: d.productId, title: d.title, days: [] }
    p.days.push({ date: d.date, spend: d.spend, clicks: d.clicks })
    if (d.title && !p.title) p.title = d.title
    products.set(key, p)
  }

  const candidates: DraftingCandidate[] = []

  for (const [, p] of products) {
    const sales = salesByStore[p.store]?.get(p.id) || { sales_7d: 0, sales_14d: 0, sales_30d: 0, revenue_7d: 0, revenue_14d: 0, revenue_30d: 0, title: "" }
    const title = p.title || sales.title || `Product ${p.id}`

    const spend_7d = p.days.filter((d) => d.date >= from7).reduce((a, d) => a + d.spend, 0)
    const spend_14d = p.days.filter((d) => d.date >= from14).reduce((a, d) => a + d.spend, 0)
    const spend_30d = p.days.reduce((a, d) => a + d.spend, 0)
    const clicks_7d = p.days.filter((d) => d.date >= from7).reduce((a, d) => a + d.clicks, 0)
    const clicks_14d = p.days.filter((d) => d.date >= from14).reduce((a, d) => a + d.clicks, 0)
    const clicks_30d = p.days.reduce((a, d) => a + d.clicks, 0)

    if (spend_30d < 1) continue

    const metrics: ProductMetrics = {
      spend_7d: round2(spend_7d),
      spend_14d: round2(spend_14d),
      spend_30d: round2(spend_30d),
      clicks_7d, clicks_14d, clicks_30d,
      cpc_30d: clicks_30d > 0 ? round2(spend_30d / clicks_30d) : 0,
      sales_7d: sales.sales_7d,
      sales_14d: sales.sales_14d,
      sales_30d: sales.sales_30d,
      revenue_7d: round2(sales.revenue_7d),
      revenue_14d: round2(sales.revenue_14d),
      revenue_30d: round2(sales.revenue_30d),
      roas_7d: spend_7d > 0 ? round2(sales.revenue_7d / spend_7d) : 0,
      roas_14d: spend_14d > 0 ? round2(sales.revenue_14d / spend_14d) : 0,
      roas_30d: spend_30d > 0 ? round2(sales.revenue_30d / spend_30d) : 0,
    }

    const flags = evaluateRules(p.store, p.id, title, metrics)
    for (const f of flags) candidates.push(f)
  }

  const actionable = candidates.filter((c) => c.action !== "keep")
  const byStore: Record<string, DraftingCandidate[]> = {}
  for (const c of actionable) {
    if (!byStore[c.store]) byStore[c.store] = []
    byStore[c.store].push(c)
  }

  // Try to store in Supabase (non-blocking: table may not exist yet)
  let stored = false
  try {
    const db = getServiceClient()
    const rows = actionable.map((c) => ({
      store: c.store,
      product_id: c.product_id,
      product_title: c.product_title,
      rule_number: c.rule_number,
      rule_type: c.rule_type,
      action: c.action,
      reason: c.reason,
      metrics: c.metrics,
    }))
    if (rows.length > 0) {
      await db.from("drafting_candidates").delete().neq("id", 0).eq("dismissed", false)
      const { error } = await db.from("drafting_candidates").insert(rows)
      if (error) errors.push(`Supabase: ${error.message}`)
      else stored = true
    }
  } catch (e) {
    errors.push(`Supabase: ${e instanceof Error ? e.message : String(e)}`)
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    period: { from: from30, to },
    summary: {
      total_products: products.size,
      actionable: actionable.length,
      draft: actionable.filter((c) => c.action === "draft").length,
      raise_price: actionable.filter((c) => c.action === "raise_price").length,
      by_rule: Object.fromEntries(
        [4, 5, 6, 7, 8, 9, 10].map((r) => [r, actionable.filter((c) => c.rule_number === r).length]),
      ),
    },
    by_store: byStore,
    all_candidates: candidates,
    stored,
    errors,
    notes: [
      "Rules 1-3 need product published date (not available from Windsor/Shopify). Check those manually in Adgain.",
      "Revenue is in store currency (EUR/GBP/USD). Spend is EUR (all Google accounts billed in EUR).",
      "ROAS uses store-currency revenue ÷ EUR spend — cross-currency for Carter & Collins (GBP) and Susan & Allen (USD).",
    ],
  })
}
