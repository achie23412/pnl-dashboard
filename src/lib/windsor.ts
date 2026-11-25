import { SHOPIFY_ACCOUNT_MAP, WINDSOR_ACCOUNT_MAP } from "./constants"

const BASE = "https://connectors.windsor.ai/all"

interface WindsorRow {
  date: string
  account_name: string
  [key: string]: string | number | null
}

async function fetchWindsor(connector: string, fields: string[], dateFrom: string, dateTo: string): Promise<WindsorRow[]> {
  const params = new URLSearchParams({
    api_key: process.env.WINDSOR_API_KEY!,
    connector,
    date_from: dateFrom,
    date_to: dateTo,
    fields: fields.join(","),
  })
  const res = await fetch(`${BASE}?${params}`)
  if (!res.ok) throw new Error(`Windsor ${connector}: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return Array.isArray(json.data) ? json.data : []
}

export interface ShopifyRevenueRow {
  date: string
  store: string
  revenue: number
  orders: number
}

export interface ShopifyRefundRow {
  date: string
  store: string
  order_id: string
  refund_id: string
  amount: number
}

// Windsor's Shopify connector returns two kinds of rows:
//  - order rows (order_refund_id empty), dated on the order date
//  - refund rows (order_refund_id set), dated on the refund date, with a
//    NEGATIVE order_total_price equal to the refunded amount
// Revenue and orders count order rows only; refund rows become refunds.
export async function fetchShopifyRevenueAndRefunds(
  dateFrom: string,
  dateTo: string,
): Promise<{ revenue: ShopifyRevenueRow[]; refunds: ShopifyRefundRow[] }> {
  const rows = await fetchWindsor(
    "shopify",
    ["date", "account_name", "order_id", "order_total_price", "order_refund_id", "order_refunds_net"],
    dateFrom,
    dateTo,
  )
  return { revenue: aggregateRevenue(rows.filter((r) => !r.order_refund_id)), refunds: extractRefunds(rows) }
}

export interface GoogleProductSpend {
  store: string
  productId: string // Shopify product id
  title: string // product title without the " / variant" suffix
  spend: number
}

// Google Shopping spend per product. product_item_id looks like
// "shopify_<country>_<productId>_<variantId>"; variants are summed per product.
export async function fetchGoogleProductSpend(dateFrom: string, dateTo: string): Promise<GoogleProductSpend[]> {
  const rows = await fetchWindsor("google_ads", ["date", "account_name", "product_item_id", "product_title", "spend"], dateFrom, dateTo)
  const byKey = new Map<string, GoogleProductSpend>()
  for (const r of rows) {
    const mapping = WINDSOR_ACCOUNT_MAP[r.account_name]
    if (mapping?.channel !== "Google") continue
    const m = String(r.product_item_id || "").match(/^shopify_[a-z]+_(\d+)_/i)
    if (!m) continue
    const key = `${mapping.store}|${m[1]}`
    const entry = byKey.get(key) || {
      store: mapping.store,
      productId: m[1],
      title: String(r.product_title || "").replace(/\s+\/\s+[^/]+$/, "").trim(),
      spend: 0,
    }
    entry.spend += Number(r.spend) || 0
    byKey.set(key, entry)
  }
  return Array.from(byKey.values())
}

// Shopify order id -> order total actually paid (shop currency), order rows only.
export async function fetchShopifyOrderTotals(dateFrom: string, dateTo: string): Promise<Map<string, number>> {
  const rows = await fetchWindsor("shopify", ["date", "account_name", "order_id", "order_total_price", "order_refund_id"], dateFrom, dateTo)
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (row.order_refund_id) continue
    const id = String(row.order_id)
    if (!totals.has(id)) totals.set(id, Number(row.order_total_price) || 0)
  }
  return totals
}

export async function fetchShopifyRevenue(dateFrom: string, dateTo: string): Promise<ShopifyRevenueRow[]> {
  return (await fetchShopifyRevenueAndRefunds(dateFrom, dateTo)).revenue
}

function extractRefunds(rows: WindsorRow[]): ShopifyRefundRow[] {
  const byRefundId = new Map<string, ShopifyRefundRow>()
  for (const row of rows) {
    if (!row.order_refund_id) continue
    const refundId = String(row.order_refund_id)
    if (byRefundId.has(refundId)) continue
    const fromTotal = -(Number(row.order_total_price) || 0)
    const amount = fromTotal > 0 ? fromTotal : Number(row.order_refunds_net) || 0
    if (amount <= 0) continue
    byRefundId.set(refundId, {
      date: row.date,
      store: SHOPIFY_ACCOUNT_MAP[row.account_name] || row.account_name,
      order_id: String(row.order_id),
      refund_id: refundId,
      amount: Math.round(amount * 100) / 100,
    })
  }
  return Array.from(byRefundId.values())
}

function aggregateRevenue(rows: WindsorRow[]): ShopifyRevenueRow[] {
  const byDateStore = new Map<string, { revenue: number; orderIds: Set<string> }>()
  for (const row of rows) {
    const store = SHOPIFY_ACCOUNT_MAP[row.account_name] || row.account_name
    const key = `${row.date}|${store}`
    let entry = byDateStore.get(key)
    if (!entry) {
      entry = { revenue: 0, orderIds: new Set() }
      byDateStore.set(key, entry)
    }
    const oid = String(row.order_id)
    if (!entry.orderIds.has(oid)) {
      entry.orderIds.add(oid)
      entry.revenue += Number(row.order_total_price) || 0
    }
  }

  return Array.from(byDateStore.entries()).map(([key, val]) => {
    const [date, store] = key.split("|")
    return { date, store, revenue: Math.round(val.revenue * 100) / 100, orders: val.orderIds.size }
  })
}

export async function fetchMetaSpend(dateFrom: string, dateTo: string) {
  const rows = await fetchWindsor("facebook", ["date", "account_name", "spend"], dateFrom, dateTo)
  return rows
    .filter((r) => {
      const mapping = WINDSOR_ACCOUNT_MAP[r.account_name]
      return mapping?.channel === "Meta"
    })
    .map((r) => ({
      date: r.date,
      channel: "Meta",
      account: r.account_name,
      store: WINDSOR_ACCOUNT_MAP[r.account_name]?.store || r.account_name,
      spend: Number(r.spend) || 0,
    }))
}

export async function fetchTikTokSpend(dateFrom: string, dateTo: string) {
  const rows = await fetchWindsor("tiktok", ["date", "account_name", "spend"], dateFrom, dateTo)
  return rows
    .filter((r) => {
      const mapping = WINDSOR_ACCOUNT_MAP[r.account_name]
      return mapping?.channel === "TikTok"
    })
    .map((r) => ({
      date: r.date,
      channel: "TikTok",
      account: r.account_name,
      store: WINDSOR_ACCOUNT_MAP[r.account_name]?.store || r.account_name,
      spend: Number(r.spend) || 0,
    }))
}

export async function fetchGoogleAdsSpend(dateFrom: string, dateTo: string) {
  const rows = await fetchWindsor("google_ads", ["date", "account_name", "spend"], dateFrom, dateTo)
  return rows
    .filter((r) => {
      const mapping = WINDSOR_ACCOUNT_MAP[r.account_name]
      return mapping?.channel === "Google"
    })
    .map((r) => ({
      date: r.date,
      channel: "Google",
      account: r.account_name,
      store: WINDSOR_ACCOUNT_MAP[r.account_name]?.store || r.account_name,
      spend: Number(r.spend) || 0,
    }))
}
