import { SHOPIFY_ACCOUNT_MAP, WINDSOR_ACCOUNT_MAP, STORE_TIMEZONE } from "./constants"

const BASE = "https://connectors.windsor.ai/all"

export interface WindsorRow {
  date: string
  account_name: string
  [key: string]: string | number | null
}

// revalidateSec: cache the response in Next's data cache for that long. Only
// used by read-only dashboard routes; the refresh skips Next's cache (Windsor's own cache: see freshDateTo).
// Windsor answers a query it has seen before from its own cached copy, and on our plan that copy
// can stay hours old (today's Google spend stuck at the morning's number). A query that reaches
// yesterday or today therefore gets an end date 1–24 days in the future that changes every hour
// (Amsterdam): future days have no rows, but the new query makes Windsor read fresh data. Rows
// after the real end date are dropped, so callers get exactly what they asked for.
function freshDateTo(dateTo: string): string {
  const now = new Date()
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((x) => [x.type, x.value]),
  )
  const today = `${p.year}-${p.month}-${p.day}`
  const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 86400000).toISOString().slice(0, 10)
  if (dateTo < yesterday) return dateTo
  const end = dateTo > today ? dateTo : today
  return new Date(Date.parse(end + "T00:00:00Z") + (1 + (Number(p.hour) || 0)) * 86400000).toISOString().slice(0, 10)
}

export async function fetchWindsor(connector: string, fields: string[], dateFrom: string, dateTo: string, revalidateSec?: number): Promise<WindsorRow[]> {
  const askTo = fields.includes("date") ? freshDateTo(dateTo) : dateTo
  const params = new URLSearchParams({
    api_key: process.env.WINDSOR_API_KEY!,
    connector,
    date_from: dateFrom,
    date_to: askTo,
    fields: fields.join(","),
  })
  const res = await fetch(
    `${BASE}?${params}`,
    revalidateSec ? { next: { revalidate: revalidateSec } } : { cache: "no-store" },
  )
  if (!res.ok) throw new Error(`Windsor ${connector}: ${res.status} ${await res.text()}`)
  const json = await res.json()
  const rows: WindsorRow[] = Array.isArray(json.data) ? json.data : []
  return askTo === dateTo ? rows : rows.filter((r) => String(r.date).slice(0, 10) <= dateTo)
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

export interface GoogleProductDaily {
  store: string
  productId: string
  title: string
  date: string
  spend: number
  clicks: number
}

export async function fetchGoogleProductDaily(dateFrom: string, dateTo: string): Promise<GoogleProductDaily[]> {
  const rows = await fetchWindsor("google_ads", ["date", "account_name", "product_item_id", "product_title", "spend", "clicks"], dateFrom, dateTo, 3600)
  const byKey = new Map<string, GoogleProductDaily>()
  for (const r of rows) {
    const mapping = WINDSOR_ACCOUNT_MAP[r.account_name]
    if (mapping?.channel !== "Google") continue
    const m = String(r.product_item_id || "").match(/^shopify_[a-z]+_(\d+)_/i)
    if (!m) continue
    const date = String(r.date).slice(0, 10)
    const key = `${mapping.store}|${m[1]}|${date}`
    const entry = byKey.get(key) || {
      store: mapping.store,
      productId: m[1],
      title: String(r.product_title || "").replace(/\s+\/\s+[^/]+$/, "").trim(),
      date,
      spend: 0,
      clicks: 0,
    }
    entry.spend += Number(r.spend) || 0
    entry.clicks += Number(r.clicks) || 0
    byKey.set(key, entry)
  }
  return Array.from(byKey.values())
}

// Google Shopping spend per product. product_item_id looks like
// "shopify_<country>_<productId>_<variantId>"; variants are summed per product.
export async function fetchGoogleProductSpend(dateFrom: string, dateTo: string): Promise<GoogleProductSpend[]> {
  const rows = await fetchWindsor("google_ads", ["date", "account_name", "product_item_id", "product_title", "spend"], dateFrom, dateTo, 3600)
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
  const rows = await fetchWindsor("shopify", ["date", "account_name", "order_id", "order_total_price", "order_refund_id"], dateFrom, dateTo, 3600)
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

// ---- Ad spend per STORE day ----
// Ad accounts report days in their own timezone (Google + TikTok: Amsterdam, Meta LUMEGLASSES:
// Los Angeles) while Shopify revenue counts the store's own day (UK = London, US = New York).
// So spend is pulled per hour and regrouped into the store's day, so ROAS and profit compare
// the same 24 hours.

const DEFAULT_AD_TZ = "Europe/Amsterdam" // TikTok has no timezone field; its accounts run on NL time

function tzOffsetMs(tz: string, utcMs: number): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(utcMs))
    .reduce((a, x) => ((a[x.type] = x.value), a), {} as Record<string, string>)
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs
}
// Local date + hour in a timezone -> UTC milliseconds
function zonedToUtc(date: string, hour: number, tz: string): number {
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hour)
  let utc = guess - tzOffsetMs(tz, guess)
  utc = guess - tzOffsetMs(tz, utc)
  return utc
}
function dayIn(tz: string, utcMs: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(utcMs))
}
const shiftDay = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10)

type SpendOut = { date: string; channel: string; account: string; store: string; spend: number }

async function fetchHourlySpend(
  connector: string,
  channel: string,
  hourField: string,
  tzField: string | null,
  parseHour: (v: string) => number,
  dateFrom: string,
  dateTo: string,
): Promise<SpendOut[]> {
  // one day either side, so the first and last store day get all their hours
  const fields = ["date", "account_name", hourField, "spend", ...(tzField ? [tzField] : [])]
  let rows = await fetchWindsor(connector, fields, shiftDay(dateFrom, -1), shiftDay(dateTo, 1)).catch(() => [] as WindsorRow[])
  if (!rows.some((r) => WINDSOR_ACCOUNT_MAP[r.account_name]?.channel === channel && Number(r.spend) > 0)) {
    // No hourly data: fall back to the ad account's own days (as before)
    rows = (await fetchWindsor(connector, ["date", "account_name", "spend"], dateFrom, dateTo)).map((r) => ({ ...r, [hourField]: null, __daily: 1 }))
  }
  const sums = new Map<string, SpendOut>()
  const add = (day: string, account: string, store: string, spend: number) => {
    if (day < dateFrom || day > dateTo) return
    const k = `${day}|${account}`
    const cur = sums.get(k) || { date: day, channel, account, store, spend: 0 }
    cur.spend += spend
    sums.set(k, cur)
  }
  // Hourly spend per ad-account day, to compare with the daily totals below
  const hourlyByAdDay = new Map<string, { spend: number; adTz: string }>()
  const hourly = !rows.some((r) => r.__daily)
  for (const r of rows) {
    const mapping = WINDSOR_ACCOUNT_MAP[r.account_name]
    if (mapping?.channel !== channel) continue // /all can return other connectors' accounts too
    const spend = Number(r.spend) || 0
    if (!spend) continue
    const hv = r[hourField]
    const adTz = (tzField && r[tzField] ? String(r[tzField]) : "") || DEFAULT_AD_TZ
    const storeTz = STORE_TIMEZONE[mapping.store] || adTz
    const adDay = String(r.date).slice(0, 10)
    const day = r.__daily || hv == null || hv === "" ? adDay : dayIn(storeTz, zonedToUtc(adDay, parseHour(String(hv)), adTz))
    if (hourly) {
      const h = hourlyByAdDay.get(`${adDay}|${r.account_name}`) || { spend: 0, adTz }
      h.spend += spend
      hourlyByAdDay.set(`${adDay}|${r.account_name}`, h)
    }
    add(day, r.account_name, mapping.store, spend)
  }
  // Windsor's hourly report runs 1–2 hours behind its daily totals (Google: today's last hours
  // missing). Where an ad-account day's daily total is higher than its hours add up to, the
  // difference is spend from the latest hours: book it on the store day of that day's last
  // hour so far (now, for today).
  if (hourly) {
    const daily = await fetchWindsor(connector, ["date", "account_name", "spend"], shiftDay(dateFrom, -1), shiftDay(dateTo, 1)).catch(() => [] as WindsorRow[])
    const seen = new Set<string>()
    for (const r of daily) {
      const mapping = WINDSOR_ACCOUNT_MAP[r.account_name]
      if (mapping?.channel !== channel) continue
      const adDay = String(r.date).slice(0, 10)
      const k = `${adDay}|${r.account_name}`
      if (seen.has(k)) continue // /all can repeat rows
      seen.add(k)
      const h = hourlyByAdDay.get(k)
      const missing = (Number(r.spend) || 0) - (h?.spend || 0)
      if (missing < 0.5) continue
      const adTz = h?.adTz || DEFAULT_AD_TZ
      const storeTz = STORE_TIMEZONE[mapping.store] || adTz
      const last = Math.min(Date.now(), zonedToUtc(shiftDay(adDay, 1), 0, adTz)) - 1
      add(dayIn(storeTz, last), r.account_name, mapping.store, missing)
    }
  }
  return Array.from(sums.values()).map((x) => ({ ...x, spend: Math.round(x.spend * 100) / 100 }))
}

const hourFromRange = (v: string) => parseInt(v.slice(0, 2), 10) || 0 // Meta "13:00:00 - 13:59:59"
const hourFromNumber = (v: string) => parseInt(v, 10) || 0 // Google "13"
const hourFromDateTime = (v: string) => parseInt(v.slice(11, 13), 10) || 0 // TikTok "2026-11-25 13:00:00"

export async function fetchMetaSpend(dateFrom: string, dateTo: string) {
  return fetchHourlySpend("facebook", "Meta", "hourly_stats_aggregated_by_advertiser_time_zone", "account_timezone", hourFromRange, dateFrom, dateTo)
}

export async function fetchTikTokSpend(dateFrom: string, dateTo: string) {
  return fetchHourlySpend("tiktok", "TikTok", "hour", null, hourFromDateTime, dateFrom, dateTo)
}

export async function fetchGoogleAdsSpend(dateFrom: string, dateTo: string) {
  return fetchHourlySpend("google_ads", "Google", "hour", "account_time_zone", hourFromNumber, dateFrom, dateTo)
}
