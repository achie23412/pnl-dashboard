// Cashflow & Balance (server). Sources:
//  - Windsor Shopify connector: orders (payment gateway per order), Shopify
//    Payments payouts and balance transactions (pending / in transit / fees).
//  - Supabase: ad spend, COGS, refunds (same numbers as the Main Hub).
// Everything in EUR (ECB daily rates). Windsor history is limited to 30 days.
import { fetchWindsor } from "@/lib/windsor"
import { SHOPIFY_ACCOUNT_MAP } from "@/lib/constants"
import { STORE_CURRENCY, COGS_CURRENCY, AD_SPEND_CURRENCY, fetchEurRates, toEur, type Currency } from "@/lib/currency"
import { getServiceClient } from "@/lib/supabase"
import { selectAll } from "@/lib/opportunity-db"

export const PROCESSORS = ["Shopify Payments", "PayPal", "Whop", "Manual", "Other"] as const
export type Processor = (typeof PROCESSORS)[number]

export function processorOf(gateway: string): Processor {
  const g = gateway.toLowerCase()
  if (g.includes("shopify_payments") || g.includes("shopify payments")) return "Shopify Payments"
  if (g.includes("paypal")) return "PayPal"
  if (g.includes("whop")) return "Whop"
  if (g.includes("manual")) return "Manual"
  return "Other"
}

// "['shopify_payments', 'paypal']" -> ["shopify_payments", "paypal"]
export function parseGateways(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String)
  const s = String(raw || "")
  const m = s.match(/'([^']+)'|"([^"]+)"/g)
  if (m) return m.map((x) => x.replace(/['"]/g, ""))
  return s ? [s] : []
}

const asCur = (c: unknown): Currency => (c === "USD" || c === "GBP" ? c : "EUR")
const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)
const round = (n: number) => Math.round(n * 100) / 100

export interface StoreBalance {
  store: string
  pending: number // Shopify Payments: sold, not yet in a payout
  in_transit: number // payout on its way to the bank
  paid_out_30d: number
  fees_30d: number
  last_payout: { date: string; amount: number } | null
}

export interface ProcessorFlow {
  processor: Processor
  incoming_7d: number
  incoming_30d: number
  orders_30d: number
  balance_known: boolean
  stores: string[]
}

export interface DayFlow {
  date: string
  incoming: number
  ad_spend: number
  cogs: number
  refunds: number
  fees: number
  net: number
}

export interface CashflowData {
  generated_at: string
  totals: {
    balance_known: number // Shopify Payments pending + in transit
    incoming_7d: number
    outgoing_7d: number
    net_7d: number
    incoming_30d: number
    outgoing_30d: number
    net_30d: number
  }
  stores: StoreBalance[]
  processors: ProcessorFlow[]
  days: DayFlow[]
  payouts: { date: string; store: string; amount: number; currency: string; status: string }[]
  notes: string[]
}

export async function buildCashflow(): Promise<CashflowData> {
  const from = day(29)
  const to = day(0)
  const from7 = day(6)
  const db = getServiceClient()
  const storeOf = (acc: string) => SHOPIFY_ACCOUNT_MAP[acc] || acc

  const [orders, payouts, btx, spend, cogs, refunds, rates] = await Promise.all([
    fetchWindsor("shopify", ["date", "account_name", "order_id", "order_total_price", "order_payment_gateways", "order_refund_id"], from, to, 1800),
    fetchWindsor("shopify", ["account_name", "payout_id", "payout_date", "payout_amount", "payout_currency", "payout_status"], from, to, 1800),
    fetchWindsor("shopify", ["date", "account_name", "balance_transaction_type", "balance_transaction_net", "balance_transaction_fee", "balance_transaction_currency", "balance_transaction_payout_status"], from, to, 1800),
    selectAll<{ date: string; store: string; spend: number }>(db, "daily_spend", "date,store,spend", (q) => q.gte("date", from)),
    selectAll<{ date: string; store: string; cogs: number }>(db, "daily_cogs", "date,store,cogs", (q) => q.gte("date", from)),
    selectAll<{ date: string; store: string; amount: number }>(db, "refunds", "date,store,amount", (q) => q.gte("date", from)),
    fetchEurRates(from, to),
  ])

  const days = new Map<string, DayFlow>()
  const dayRow = (d: string) => {
    let r = days.get(d)
    if (!r) {
      r = { date: d, incoming: 0, ad_spend: 0, cogs: 0, refunds: 0, fees: 0, net: 0 }
      days.set(d, r)
    }
    return r
  }

  // Incoming: order totals by payment processor (order rows only, deduped).
  const proc = new Map<Processor, ProcessorFlow>()
  const seen = new Set<string>()
  for (const o of orders) {
    if (o.order_refund_id) continue
    const key = `${o.account_name}:${o.order_id}`
    if (seen.has(key)) continue
    seen.add(key)
    const store = storeOf(String(o.account_name))
    const date = String(o.date).slice(0, 10)
    const eur = toEur(Number(o.order_total_price) || 0, STORE_CURRENCY[store] || "EUR", date, rates)
    const gws = parseGateways(o.order_payment_gateways)
    const list = gws.length ? gws : ["other"]
    for (const g of list) {
      const p = processorOf(g)
      const share = eur / list.length
      const f = proc.get(p) || { processor: p, incoming_7d: 0, incoming_30d: 0, orders_30d: 0, balance_known: p === "Shopify Payments", stores: [] }
      f.incoming_30d += share
      if (date >= from7) f.incoming_7d += share
      f.orders_30d += 1 / list.length
      if (!f.stores.includes(store)) f.stores.push(store)
      proc.set(p, f)
    }
    dayRow(date).incoming += eur
  }

  // Shopify Payments balances per store.
  const stores = new Map<string, StoreBalance>()
  const sb = (store: string) => {
    let s = stores.get(store)
    if (!s) {
      s = { store, pending: 0, in_transit: 0, paid_out_30d: 0, fees_30d: 0, last_payout: null }
      stores.set(store, s)
    }
    return s
  }
  for (const t of btx) {
    const store = storeOf(String(t.account_name))
    const cur = asCur(t.balance_transaction_currency)
    const date = String(t.date || to).slice(0, 10)
    const net = toEur(Number(t.balance_transaction_net) || 0, cur, date, rates)
    const fee = toEur(Number(t.balance_transaction_fee) || 0, cur, date, rates)
    const status = String(t.balance_transaction_payout_status || "").toUpperCase()
    const type = String(t.balance_transaction_type || "").toUpperCase()
    const s = sb(store)
    s.fees_30d += fee
    dayRow(date).fees += fee
    if (type === "TRANSFER") {
      if (status === "IN_TRANSIT") s.in_transit += -net
    } else if (status === "PENDING") {
      s.pending += net
    }
  }
  const payoutList: CashflowData["payouts"] = []
  for (const p of payouts) {
    const store = storeOf(String(p.account_name))
    const date = String(p.payout_date).slice(0, 10)
    const cur = asCur(p.payout_currency)
    const amount = Number(p.payout_amount) || 0
    const eur = toEur(amount, cur, date, rates)
    const s = sb(store)
    if (String(p.payout_status).toUpperCase() === "PAID") {
      s.paid_out_30d += eur
      if (!s.last_payout || date > s.last_payout.date) s.last_payout = { date, amount: round(eur) }
    }
    payoutList.push({ date, store, amount: round(amount), currency: cur, status: String(p.payout_status) })
  }

  // Outgoing: ad spend (store currency), COGS (USD), refunds (store currency).
  for (const r of spend) dayRow(r.date).ad_spend += toEur(Number(r.spend) || 0, AD_SPEND_CURRENCY, r.date, rates)
  for (const r of cogs) dayRow(r.date).cogs += toEur(Number(r.cogs) || 0, COGS_CURRENCY, r.date, rates)
  for (const r of refunds) dayRow(r.date).refunds += toEur(Number(r.amount) || 0, STORE_CURRENCY[r.store] || "EUR", r.date, rates)

  const dayList = Array.from(days.values())
    .filter((d) => d.date >= from && d.date <= to)
    .map((d) => ({
      ...d,
      incoming: round(d.incoming),
      ad_spend: round(d.ad_spend),
      cogs: round(d.cogs),
      refunds: round(d.refunds),
      fees: round(d.fees),
      net: round(d.incoming - d.ad_spend - d.cogs - d.refunds - d.fees),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
  const sum = (list: DayFlow[], f: (d: DayFlow) => number) => round(list.reduce((a, d) => a + f(d), 0))
  const last7 = dayList.filter((d) => d.date >= from7)
  const out = (d: DayFlow) => d.ad_spend + d.cogs + d.refunds + d.fees

  const storeList = Array.from(stores.values())
    .map((s) => ({ ...s, pending: round(s.pending), in_transit: round(s.in_transit), paid_out_30d: round(s.paid_out_30d), fees_30d: round(s.fees_30d) }))
    .sort((a, b) => b.pending + b.in_transit - (a.pending + a.in_transit))

  return {
    generated_at: new Date().toISOString(),
    totals: {
      balance_known: round(storeList.reduce((a, s) => a + s.pending + s.in_transit, 0)),
      incoming_7d: sum(last7, (d) => d.incoming),
      outgoing_7d: sum(last7, out),
      net_7d: sum(last7, (d) => d.net),
      incoming_30d: sum(dayList, (d) => d.incoming),
      outgoing_30d: sum(dayList, out),
      net_30d: sum(dayList, (d) => d.net),
    },
    stores: storeList,
    processors: Array.from(proc.values())
      .map((p) => ({ ...p, incoming_7d: round(p.incoming_7d), incoming_30d: round(p.incoming_30d), orders_30d: Math.round(p.orders_30d) }))
      .sort((a, b) => b.incoming_30d - a.incoming_30d),
    days: dayList,
    payouts: payoutList.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25),
    notes: [
      "Shopify Payments balance = sales not yet paid out (pending) + payouts on their way to the bank (in transit). Older pending sales than 30 days are not included (Windsor trial limit).",
      "PayPal, Whop and Manual (likely Whale Checkout) show money coming in per order; their account balances and fees aren't connected yet.",
      "Outgoing = ad spend + COGS (ShipGoods) + refunds + Shopify Payments fees. Agency fees, apps and team costs are not included.",
    ],
  }
}
