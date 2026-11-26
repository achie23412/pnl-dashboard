// ShipGoods order costs saved in Supabase (table shipgoods_orders, see supabase/shipgoods-orders.sql),
// so the product catalog reads them in well under a second instead of ~6 s per ShipGoods page.
import { getServiceClient } from "@/lib/supabase"

export interface StoredShipgoodsItem {
  product_id?: string
  title: string
  unit_cost: number
  quantity: number
  product_cost: number
  sold_price: number
}
export interface StoredShipgoodsOrder {
  id: number
  bill_date: string
  row_type: string | null
  store_name: string | null
  order_id: string | null
  items: StoredShipgoodsItem[]
}

type ApiRow = {
  id: number
  bill_date?: string
  ledger_date?: string
  row_type?: string
  shop_admin_id?: number
  store_name?: string
  order_id?: string
  order_number?: string
  amount?: number
  currency?: string
  items?: StoredShipgoodsItem[] | null
}
type ApiPage = { data?: { list?: ApiRow[]; pagination?: { total_pages?: number } } }

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const addDays = (ymd: string, n: number) => day(Date.parse(`${ymd}T12:00:00Z`) + n * 86400000)

// Reads ShipGoods for [from, to] (≤ 90 days; split into 30-day blocks, 8 pages at a time) and
// saves every row. Stops starting new pages after `budgetMs`; `complete` says whether all arrived.
export async function syncShipgoods(from: string, to: string, budgetMs = 45000): Promise<{ from: string; to: string; pages: number; totalPages: number; rows: number; complete: boolean; errors: string[] }> {
  const token = process.env.SHIPGOODS_TOKEN
  const base = process.env.SHIPGOODS_BASE || "https://dashboard.shipgoods.eu"
  if (!token) throw new Error("SHIPGOODS_TOKEN not set")
  const started = Date.now()
  const db = getServiceClient()
  const errors: string[] = []

  const fetchPage = async (win: [string, string], page: number, retry = true): Promise<ApiPage> => {
    const res = await fetch(`${base}/api/v1/shop/analytics/order-cost-items?date_from=${win[0]}&date_to=${win[1]}&per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    })
    if (res.status >= 500 && retry) return fetchPage(win, page, false)
    if (!res.ok) throw new Error(`${win[0]} page ${page}: HTTP ${res.status}`)
    return res.json()
  }

  let running = 0
  const queue: (() => void)[] = []
  const limited = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    if (running >= 8) await new Promise<void>((r) => queue.push(r))
    running++
    try {
      if (Date.now() - started > budgetMs) return null // out of time: don't start more
      return await fn()
    } finally { running--; queue.shift()?.() }
  }

  let rows = 0
  let pages = 0
  let totalPages = 0
  let failed = 0
  const save = async (p: ApiPage | null) => {
    if (!p) { failed++; return }
    pages++
    const list = (p.data?.list || []).filter((r) => r && r.id)
    if (!list.length) return
    const { error } = await db.from("shipgoods_orders").upsert(list.map((r) => ({
      id: r.id,
      bill_date: (r.bill_date || r.ledger_date || "").slice(0, 10),
      row_type: r.row_type || null,
      shop_admin_id: r.shop_admin_id ?? null,
      store_name: r.store_name || null,
      order_id: r.order_id || null,
      order_number: r.order_number || null,
      amount: r.amount ?? null,
      currency: r.currency || null,
      items: (r.items || []).map((i) => ({ product_id: i.product_id, title: i.title, unit_cost: i.unit_cost, quantity: i.quantity, product_cost: i.product_cost, sold_price: i.sold_price })),
      synced_at: new Date().toISOString(),
    })), { onConflict: "id" })
    if (error) throw new Error(`saving: ${error.message}`)
    rows += list.length
  }

  const windows: [string, string][] = []
  for (let s = from; s <= to; s = addDays(s, 30)) windows.push([s, addDays(s, 29) < to ? addDays(s, 29) : to])
  await Promise.all(windows.map(async (win) => {
    try {
      const first = await limited(() => fetchPage(win, 1))
      if (!first) { failed++; return }
      const n = Math.min(first.data?.pagination?.total_pages || 1, 40)
      totalPages += n
      await save(first)
      await Promise.all(Array.from({ length: n - 1 }, (_, i) =>
        limited(() => fetchPage(win, i + 2)).then(save).catch((e) => { failed++; errors.push(e instanceof Error ? e.message : String(e)) })))
    } catch (e) {
      failed++
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }))

  const complete = failed === 0 && pages === totalPages
  if (complete) await markCovered(from, to)
  return { from, to, pages, totalPages, rows, complete, errors }
}

// Widen the "fully saved" range when the new range touches or overlaps it
async function markCovered(from: string, to: string) {
  const db = getServiceClient()
  const { data } = await db.from("shipgoods_sync").select("covered_from,covered_to").eq("id", 1).maybeSingle()
  let cf = from
  let ct = to
  if (data?.covered_from && data?.covered_to) {
    const touches = from <= addDays(data.covered_to, 1) && to >= addDays(data.covered_from, -1)
    if (touches) {
      cf = data.covered_from < from ? data.covered_from : from
      ct = data.covered_to > to ? data.covered_to : to
    } else if (data.covered_to > to) {
      return // an older, separate range: keep the newer one we already have
    }
  }
  await db.from("shipgoods_sync").upsert({ id: 1, covered_from: cf, covered_to: ct, synced_at: new Date().toISOString() }, { onConflict: "id" })
}

// Saved rows for [from, to], or null when the table doesn't hold the whole range yet (or doesn't
// exist), so the caller falls back to the ShipGoods API. Today counts as covered once yesterday is
// (orders of the last hours arrive with the next sync).
export async function readStoredShipgoods(from: string, to: string): Promise<StoredShipgoodsOrder[] | null> {
  const db = getServiceClient()
  const { data: state, error } = await db.from("shipgoods_sync").select("covered_from,covered_to").eq("id", 1).maybeSingle()
  if (error || !state?.covered_from || !state?.covered_to) return null
  const yesterday = day(Date.now() - 86400000)
  const needTo = to < yesterday ? to : yesterday
  if (state.covered_from > from || state.covered_to < needTo) return null
  const out: StoredShipgoodsOrder[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error: e } = await db.from("shipgoods_orders").select("id,bill_date,row_type,store_name,order_id,items")
      .gte("bill_date", from).lte("bill_date", to).order("id").range(i, i + 999)
    if (e) return null
    out.push(...((data || []) as StoredShipgoodsOrder[]))
    if (!data || data.length < 1000) break
  }
  return out
}
