// Actual supplier cost (USD) per store for the orders PLACED on a day, from ShipGoods.
// ShipGoods prices every order itself (charged, else its quoted total), so the profit of a day
// uses what those exact orders cost, not an average. Orders ShipGoods hasn't priced yet
// (quote_pending) get the store's average priced order from the same pull, and are counted.
import { fetchOrders, type SGOrder } from "@/lib/shipgoods"
import { SHIPGOODS_SHOP_MAP, STORE_TIMEZONE } from "@/lib/constants"

export interface OrderCogsRow {
  store: string
  cogs_usd: number // priced orders + pending orders at the store's average
  priced: number // orders with a real ShipGoods price
  pending: number // orders without a price yet (average used)
}

const localDay = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))

const priceOf = (o: SGOrder): number | null => {
  const a = o.amounts || ({} as SGOrder["amounts"])
  const v = [a.charged, a.total, a.product_total].find((x) => x != null && Number(x) > 0)
  return v != null ? Number(v) : null
}

export async function orderCogsForDay(date: string): Promise<OrderCogsRow[]> {
  return orderCogsForRange(date, date)
}

// Same for every order placed from `from` to `to` (store's local days), added up per store.
export async function orderCogsForRange(from: string, to: string): Promise<OrderCogsRow[]> {
  return (await collect(from, to, false)).map(({ store, cogs_usd, priced, pending }) => ({ store, cogs_usd, priced, pending }))
}

// Same, per store per local day (Main Hub per-day breakdown).
export async function orderCogsByDay(from: string, to: string): Promise<(OrderCogsRow & { date: string })[]> {
  return collect(from, to, true)
}

async function collect(from: string, to: string, perDay: boolean): Promise<(OrderCogsRow & { date: string })[]> {
  // An order placed on `from` was last updated on or after that day; one day earlier covers timezones.
  const since = new Date(Date.parse(from + "T00:00:00Z") - 86400000).toISOString()
  const orders = await fetchOrders(since)

  const groups = new Map<string, { store: string; date: string; priced: number[]; pending: number }>()
  const avgPool = new Map<string, number[]>() // all priced orders in the pull, for the average
  for (const o of orders) {
    const store = SHIPGOODS_SHOP_MAP[o.shop_admin_id]
    if (!store || String(o.status).toLowerCase().includes("cancel")) continue
    const p = priceOf(o)
    if (p != null) avgPool.set(store, [...(avgPool.get(store) || []), p])
    const day = localDay(o.created_at, STORE_TIMEZONE[store] || "UTC")
    if (day < from || day > to) continue
    const key = perDay ? `${store}|${day}` : store
    const cur = groups.get(key) || { store, date: perDay ? day : to, priced: [], pending: 0 }
    if (p != null) cur.priced.push(p)
    else cur.pending++
    groups.set(key, cur)
  }

  return Array.from(groups.values()).map((v) => {
    const pool = avgPool.get(v.store) || []
    const avg = pool.length ? pool.reduce((a, b) => a + b, 0) / pool.length : 0
    const sum = v.priced.reduce((a, b) => a + b, 0) + v.pending * avg
    return { store: v.store, date: v.date, cogs_usd: Math.round(sum * 100) / 100, priced: v.priced.length, pending: v.pending }
  })
}
