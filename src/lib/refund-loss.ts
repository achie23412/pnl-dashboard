// What each refund really cost, and which products get refunded too often (server only).
//
// Every refund in the refund log (cs_refunds) is matched to its ShipGoods order on the Shopify
// order id (saved copy: table shipgoods_orders, USD, negative = charge):
//   COGS paid      = what ShipGoods charged for the order (product cost + shipping)
//   shipping       = that charge minus the product costs ShipGoods lists per item
//   recovered      = money ShipGoods paid back on the order (positive rows)
//   net loss (EUR) = refund + COGS not recovered, for a FULL refund (the sale is gone, the goods
//                    were paid for). A PARTIAL refund keeps the sale: its loss is the refund itself.
// An order with several refunds counts its COGS once, on the first full refund.
//
// Refund rate per product = refunded orders ÷ orders. Orders = ShipGoods orders with that product
// (plus refunded orders ShipGoods never shipped). Risky = above RISK_RATE with at least
// RISK_MIN_ORDERS orders and RISK_MIN_REFUNDS refunds, in the last 30 days or all-time.
import { SHOPIFY_STORES } from "@/lib/constants"
import { STORE_CURRENCY } from "@/lib/currency"
import { fetchLatestEurRates } from "@/lib/currency"
import { getServiceClient } from "@/lib/supabase"

export const RISK_RATE = 5 // % refunded orders
export const RISK_MIN_ORDERS = 10
export const RISK_MIN_REFUNDS = 2

type SgItem = { product_id?: string | number | null; title: string; unit_cost?: number; quantity?: number; product_cost?: number }
type SgRow = { order_id: string | null; row_type: string | null; amount: number | null; items: SgItem[] | null; store_name: string | null; bill_date: string }
type RefundItem = { title: string; variant: string | null; qty: number; price: number; product_id: string | null }
type RefundRow = {
  id: number
  store: string
  refund_date: string
  order_number: string
  shopify_order_id: string | null
  refund_type: string
  reason: string
  amount: number
  amount_eur: number | null
  currency: string
  approval_status: string
  items: RefundItem[] | null
}

export interface RefundLoss {
  matched: boolean // ShipGoods order found
  items: { title: string; qty: number; cost_usd: number }[] // what ShipGoods shipped in the order
  cogs_usd: number
  shipping_usd: number
  recovered_usd: number
  cogs_eur: number
  shipping_eur: number
  refund_eur: number
  cogs_counted: boolean // false: partial refund, or COGS already counted on another refund of this order
  net_loss_eur: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const dayAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const isFull = (t: string) => t !== "partial"
const itemCost = (i: SgItem) => Number(i.product_cost) || (Number(i.unit_cost) || 0) * (Number(i.quantity) || 1)

// myshopify prefix ("xq9pn7-dw") → store name
const STORE_BY_PREFIX: Record<string, string> = Object.fromEntries(
  Object.entries(SHOPIFY_STORES).map(([store, c]) => [c.domain.replace(".myshopify.com", ""), store]),
)

async function eurConverter() {
  const fx = await fetchLatestEurRates()
  return (amount: number, cur: string) => (cur === "USD" ? amount / fx.USD : cur === "GBP" ? amount / fx.GBP : amount)
}

async function loadRefunds(since: string): Promise<RefundRow[]> {
  const db = getServiceClient()
  const out: RefundRow[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await db
      .from("cs_refunds")
      .select("id,store,refund_date,order_number,shopify_order_id,refund_type,reason,amount,amount_eur,currency,approval_status,items")
      .gte("refund_date", since)
      .order("id")
      .range(i, i + 999)
    if (error) throw new Error(`refund log: ${error.message}`)
    out.push(...((data || []) as RefundRow[]))
    if (!data || data.length < 1000) break
  }
  return out.filter((r) => r.approval_status !== "rejected")
}

// ShipGoods rows, either for some orders or for a whole date range.
async function loadShipgoods(opts: { orderIds?: string[]; since?: string }): Promise<SgRow[]> {
  const db = getServiceClient()
  const cols = "order_id,row_type,amount,items,store_name,bill_date"
  const out: SgRow[] = []
  if (opts.orderIds) {
    const ids = Array.from(new Set(opts.orderIds.filter(Boolean)))
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db.from("shipgoods_orders").select(cols).in("order_id", ids.slice(i, i + 200))
      if (error) throw new Error(`ShipGoods orders: ${error.message}`)
      out.push(...((data || []) as SgRow[]))
    }
    return out
  }
  for (let i = 0; ; i += 1000) {
    const { data, error } = await db.from("shipgoods_orders").select(cols).gte("bill_date", opts.since || "2000-01-01").order("id").range(i, i + 999)
    if (error) throw new Error(`ShipGoods orders: ${error.message}`)
    out.push(...((data || []) as SgRow[]))
    if (!data || data.length < 1000) break
  }
  return out
}

function lossFor(refunds: RefundRow[], sg: SgRow[], toEur: (a: number, c: string) => number): Map<number, RefundLoss> {
  const byOrder = new Map<string, SgRow[]>()
  for (const r of sg) if (r.order_id) byOrder.set(String(r.order_id), [...(byOrder.get(String(r.order_id)) || []), r])
  const cogsTaken = new Set<string>()
  const out = new Map<number, RefundLoss>()
  // oldest first, so an order's COGS lands on its first full refund
  for (const r of [...refunds].sort((a, b) => a.refund_date.localeCompare(b.refund_date) || a.id - b.id)) {
    const rows = (r.shopify_order_id && byOrder.get(String(r.shopify_order_id))) || []
    const charges = rows.filter((x) => (Number(x.amount) || 0) < 0)
    const cogs = charges.reduce((a, x) => a - (Number(x.amount) || 0), 0)
    const recovered = rows.filter((x) => (Number(x.amount) || 0) > 0).reduce((a, x) => a + (Number(x.amount) || 0), 0)
    const items = charges.flatMap((x) => x.items || []).map((i) => ({ title: i.title, qty: Number(i.quantity) || 1, cost_usd: r2(itemCost(i)) }))
    const productCost = items.reduce((a, i) => a + i.cost_usd, 0)
    const shipping = Math.max(0, cogs - productCost)
    const refundEur = r.amount_eur != null ? Number(r.amount_eur) : toEur(Number(r.amount) || 0, r.currency || STORE_CURRENCY[r.store] || "EUR")
    const key = `${r.store}::${r.shopify_order_id}`
    const counted = isFull(r.refund_type) && rows.length > 0 && !cogsTaken.has(key)
    if (counted) cogsTaken.add(key)
    const lostUsd = counted ? Math.max(0, cogs - recovered) : 0
    out.set(r.id, {
      matched: rows.length > 0,
      items,
      cogs_usd: r2(cogs),
      shipping_usd: r2(shipping),
      recovered_usd: r2(recovered),
      cogs_eur: r2(toEur(cogs, "USD")),
      shipping_eur: r2(toEur(shipping, "USD")),
      refund_eur: r2(refundEur),
      cogs_counted: counted,
      net_loss_eur: r2(refundEur + toEur(lostUsd, "USD")),
    })
  }
  return out
}

// Refund id → what it cost, for the refunds of the last `days` days.
export async function refundLosses(days = 120): Promise<Record<number, RefundLoss>> {
  const [refunds, toEur] = await Promise.all([loadRefunds(dayAgo(days)), eurConverter()])
  const sg = await loadShipgoods({ orderIds: refunds.map((r) => String(r.shopify_order_id || "")) })
  return Object.fromEntries(Array.from(lossFor(refunds, sg, toEur).entries()))
}

export interface ProductRisk {
  store: string
  product_id: string | null
  title: string
  orders_30: number
  refunded_30: number
  rate_30: number | null // %
  orders_all: number
  refunded_all: number
  rate_all: number | null
  net_loss_eur: number // all-time
  net_loss_30_eur: number
  reasons: Record<string, number> // all-time, reason code → refunds
  risky: boolean
  risky_window: "30d" | "all" | null
}

// Add-ons that aren't products (shipping insurance, breakage cover): left out of the refund rate
const ADDON = /insurance|protection|warranty|breakage|lum[eé] care/i
const isRisky = (orders: number, refunded: number) => orders >= RISK_MIN_ORDERS && refunded >= RISK_MIN_REFUNDS && (refunded / orders) * 100 > RISK_RATE

// Refund rate, reasons and net refund loss per product, all stores.
export async function productRefundRisk(): Promise<{ products: ProductRisk[]; since: string }> {
  const db = getServiceClient()
  const { data: state } = await db.from("shipgoods_sync").select("covered_from").eq("id", 1).maybeSingle()
  const since = (state?.covered_from as string | undefined) || dayAgo(180)
  const [refunds, sg, toEur] = await Promise.all([loadRefunds(since), loadShipgoods({ since }), eurConverter()])
  const losses = lossFor(refunds, sg, toEur)
  const d30 = dayAgo(30)

  type Acc = { store: string; product_id: string | null; title: string; orders: Map<string, string>; refunded: Map<string, string>; loss: number; loss30: number; reasons: Record<string, number> }
  const acc = new Map<string, Acc>()
  const get = (store: string, pid: string | null, title: string) => {
    const k = pid ? `${store}|id:${pid}` : `${store}|t:${title.trim().toLowerCase()}`
    let a = acc.get(k)
    if (!a) acc.set(k, (a = { store, product_id: pid, title, orders: new Map(), refunded: new Map(), loss: 0, loss30: 0, reasons: {} }))
    return a
  }

  // Orders per product (ShipGoods order charges)
  const sgByOrder = new Map<string, SgRow[]>()
  for (const r of sg) {
    if (!r.order_id || (r.row_type && r.row_type !== "order_charge")) continue
    sgByOrder.set(String(r.order_id), [...(sgByOrder.get(String(r.order_id)) || []), r])
    const store = STORE_BY_PREFIX[r.store_name || ""]
    if (!store) continue
    for (const i of (r.items || []).filter((x) => !ADDON.test(x.title || ""))) get(store, i.product_id ? String(i.product_id) : null, i.title).orders.set(String(r.order_id), r.bill_date)
  }

  for (const r of refunds) {
    if (!SHOPIFY_STORES[r.store]) continue
    const oid = String(r.shopify_order_id || `log-${r.id}`)
    // Products refunded: from the refund itself, else everything ShipGoods shipped in the order
    let prods: { pid: string | null; title: string; weight: number; costUsd: number }[] = (r.items || []).map((i) => ({
      pid: i.product_id ? String(i.product_id) : null,
      title: i.title,
      weight: (Number(i.price) || 0) * (Number(i.qty) || 1),
      costUsd: 0,
    }))
    const sgRows = sgByOrder.get(oid) || []
    const sgItems = sgRows.flatMap((x) => x.items || [])
    prods = prods.filter((p) => !ADDON.test(p.title || ""))
    if (!prods.length) prods = sgItems.filter((i) => !ADDON.test(i.title || "")).map((i) => ({ pid: i.product_id ? String(i.product_id) : null, title: i.title, weight: 0, costUsd: 0 }))
    if (!prods.length) continue
    // each product's own cost in this order, to split the COGS part of the loss
    for (const p of prods) {
      const m = sgItems.filter((i) => (p.pid && String(i.product_id) === p.pid) || i.title === p.title)
      p.costUsd = m.reduce((a, i) => a + itemCost(i), 0)
    }
    const loss = losses.get(r.id)
    const refundEur = loss?.refund_eur ?? 0
    const cogsLossEur = loss ? loss.net_loss_eur - loss.refund_eur : 0
    const wSum = prods.reduce((a, p) => a + p.weight, 0)
    const cSum = prods.reduce((a, p) => a + p.costUsd, 0)
    const seen = new Set<Acc>()
    for (const p of prods) {
      const a = get(r.store, p.pid, p.title)
      const share = (wSum > 0 ? p.weight / wSum : 1 / prods.length) * refundEur + (cSum > 0 ? p.costUsd / cSum : 1 / prods.length) * cogsLossEur
      a.loss += share
      if (r.refund_date >= d30) a.loss30 += share
      if (seen.has(a)) continue
      seen.add(a)
      a.refunded.set(oid, r.refund_date)
      // an order that was refunded but never shipped still was an order
      if (!a.orders.has(oid)) a.orders.set(oid, r.refund_date)
      a.reasons[r.reason] = (a.reasons[r.reason] || 0) + 1
    }
  }

  const products: ProductRisk[] = []
  acc.forEach((a) => {
    if (!a.refunded.size) return // only products with refunds are interesting here
    const o30 = Array.from(a.orders.values()).filter((d) => d >= d30).length
    const f30 = Array.from(a.refunded.values()).filter((d) => d >= d30).length
    const oAll = a.orders.size
    const fAll = a.refunded.size
    const r30 = isRisky(o30, f30)
    const rAll = isRisky(oAll, fAll)
    products.push({
      store: a.store,
      product_id: a.product_id,
      title: a.title,
      orders_30: o30,
      refunded_30: f30,
      rate_30: o30 ? Math.round((f30 / o30) * 1000) / 10 : null,
      orders_all: oAll,
      refunded_all: fAll,
      rate_all: oAll ? Math.round((fAll / oAll) * 1000) / 10 : null,
      net_loss_eur: r2(a.loss),
      net_loss_30_eur: r2(a.loss30),
      reasons: a.reasons,
      risky: r30 || rAll,
      risky_window: r30 ? "30d" : rAll ? "all" : null,
    })
  })
  products.sort((a, b) => b.net_loss_eur - a.net_loss_eur)
  return { products, since }
}
