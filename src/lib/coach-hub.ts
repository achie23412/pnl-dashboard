// Main Hub summary for the daily coach post: the Overall view of the Main Hub (KPI cards, store
// comparison, per-day breakdown of the last 7 days) for the last 30 full days, fees on (as the hub's
// default). Same formulas and COGS source as the Main Hub (ShipGoods order costs per day).
import { getServiceClient } from "@/lib/supabase"
import { orderCogsByDay } from "@/lib/order-cogs"
import { AVG_COGS_PER_ORDER, TRANSACTION_FEE_RATE, STORES, breakEvenRoas, dropStopped, stoppedWithData } from "@/lib/constants"
import { mediaBuyerRate } from "@/lib/fee-settings"
import { loadFeeSettings } from "@/lib/fee-settings-server"
import { STORE_CURRENCY, COGS_CURRENCY, AD_SPEND_CURRENCY, fetchEurRates, toEur } from "@/lib/currency"
import { amsDate } from "@/lib/coach-report"

type Rev = { date: string; store: string; revenue: number; orders: number }
type Sp = { date: string; store: string; spend: number }
type Cg = { date: string; store: string; cogs: number }
type Ses = { date: string; store: string; sessions: number }
type Ref = { date: string; store: string; amount: number }

export type HubKpi = {
  revenue: number; orders: number; spend: number; roas: number; be: number | null
  refunds: number; refundRate: number; sessions: number; cvr: number | null
  cogs: number; cogsPct: number; cogsEst: number; fees: number; profit: number; margin: number | null
}
export type HubStore = { store: string; revenue: number; spend: number; orders: number; roas: number; refundRate: number; profit: number }
export type HubDay = { date: string; revenue: number; orders: number; sessions: number | null; cvr: number | null; roas: number; be: number | null; spend: number; cogs: number; cogsPct: number | null; refunds: number; fees: number; profit: number; margin: number | null }
export type HubReport = { reportDate: string; from: string; to: string; kpi: HubKpi; stores: HubStore[]; days: HubDay[] }

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0)

export async function buildHub(): Promise<HubReport> {
  const reportDate = amsDate(0)
  const to = amsDate(-1)
  const from = new Date(Date.parse(to + "T00:00:00Z") - 29 * 86400000).toISOString().slice(0, 10)
  const db = getServiceClient()
  const q = (table: string, cols: string) => db.from(table).select(cols).gte("date", from).lte("date", to).limit(5000)
  const [r1, r2, r3, r4, r5] = await Promise.all([
    q("daily_revenue", "date,store,revenue,orders"), q("daily_spend", "date,store,spend"), q("daily_cogs", "date,store,cogs"),
    q("daily_sessions", "date,store,sessions"), q("refunds", "date,store,amount"),
  ])
  const err = r1.error || r2.error || r3.error || r4.error || r5.error
  if (err) throw new Error(err.message)
  const [rates, fees] = await Promise.all([fetchEurRates(from, to), loadFeeSettings()])
  const d10 = (d: string) => String(d).slice(0, 10)
  const rev: Rev[] = dropStopped(r1.data as unknown as Rev[]).map((r) => ({ ...r, date: d10(r.date), orders: Number(r.orders) || 0, revenue: toEur(Number(r.revenue) || 0, STORE_CURRENCY[r.store] || "EUR", d10(r.date), rates) }))
  const sp: Sp[] = dropStopped(r2.data as unknown as Sp[]).map((r) => ({ ...r, date: d10(r.date), spend: toEur(Number(r.spend) || 0, AD_SPEND_CURRENCY, d10(r.date), rates) }))
  const savedCg: Cg[] = dropStopped(r3.data as unknown as Cg[]).map((r) => ({ ...r, date: d10(r.date), cogs: toEur(Number(r.cogs) || 0, COGS_CURRENCY, d10(r.date), rates) }))
  // As the Main Hub page: what ShipGoods charged for the orders placed that day replaces the saved
  // daily COGS (orders ShipGoods doesn't have yet at that day's average). If ShipGoods fails: saved COGS.
  const shipgoods = new Map<string, number>()
  try {
    const ordersAt = new Map<string, number>()
    for (const r of rev) ordersAt.set(`${r.store}|${r.date}`, (ordersAt.get(`${r.store}|${r.date}`) || 0) + r.orders)
    for (const o of await orderCogsByDay(from, to)) {
      const n = o.priced + o.pending
      if (n <= 0) continue
      const missing = Math.max(0, (ordersAt.get(`${o.store}|${o.date}`) || 0) - n)
      shipgoods.set(`${o.store}|${o.date}`, toEur(o.cogs_usd + missing * (o.cogs_usd / n), COGS_CURRENCY, o.date, rates))
    }
  } catch {
    shipgoods.clear()
  }
  const cg: Cg[] = [
    ...savedCg.filter((r) => !shipgoods.has(`${r.store}|${r.date}`)),
    ...Array.from(shipgoods.entries()).map(([k, v]) => ({ store: k.split("|")[0], date: k.split("|")[1], cogs: v })),
  ]
  const ses: Ses[] = dropStopped(r4.data as unknown as Ses[]).map((r) => ({ ...r, date: d10(r.date), sessions: Number(r.sessions) || 0 }))
  const ref: Ref[] = dropStopped(r5.data as unknown as Ref[]).map((r) => ({ ...r, date: d10(r.date), amount: toEur(Number(r.amount) || 0, STORE_CURRENCY[r.store] || "EUR", d10(r.date), rates) }))

  const txnRate = (s: string) => TRANSACTION_FEE_RATE[s] || 0.035
  const mb = (s: string, d: string) => mediaBuyerRate(fees, s, d)

  function kpiOf(R: Rev[], S: Sp[], C: Cg[], SE: Ses[], F: Ref[]): HubKpi {
    const revenue = sum(R, (r) => r.revenue)
    const orders = sum(R, (r) => r.orders)
    const spend = sum(S, (r) => r.spend)
    const refunds = sum(F, (r) => r.amount)
    const cogsDays = new Set(C.map((r) => `${r.date}|${r.store}`))
    const cogsEst = sum(R.filter((r) => !cogsDays.has(`${r.date}|${r.store}`)), (r) => r.orders * toEur(AVG_COGS_PER_ORDER[r.store] || 0, COGS_CURRENCY, r.date, rates))
    const cogs = sum(C, (r) => r.cogs) + cogsEst
    const txn = sum(R, (r) => r.revenue * txnRate(r.store))
    const mbFee = sum(S, (r) => r.spend * mb(r.store, r.date))
    const profit = revenue - refunds - spend - cogs - txn - mbFee
    const sesDays = new Set(SE.map((r) => `${r.date}|${r.store}`))
    const sessions = sum(SE, (r) => r.sessions)
    const ordersWithSes = sum(R.filter((r) => sesDays.has(`${r.date}|${r.store}`)), (r) => r.orders)
    const be = revenue > 0 ? breakEvenRoas(cogs / revenue, txn / revenue, spend > 0 ? mbFee / spend : 0) : NaN
    return {
      revenue, orders, spend, roas: spend > 0 ? revenue / spend : 0, be: Number.isFinite(be) ? be : null,
      refunds, refundRate: revenue > 0 ? (refunds / revenue) * 100 : 0, sessions, cvr: sessions > 0 ? (ordersWithSes / sessions) * 100 : null,
      cogs, cogsPct: revenue > 0 ? (cogs / revenue) * 100 : 0, cogsEst, fees: txn + mbFee, profit, margin: revenue > 0 ? (profit / revenue) * 100 : null,
    }
  }

  const kpi = kpiOf(rev, sp, cg, ses, ref)
  const storeNames: string[] = [...STORES.filter((s) => s !== "Overall"), ...stoppedWithData(rev, sp)]
  const stores = storeNames.map((s) => {
    const k = kpiOf(rev.filter((r) => r.store === s), sp.filter((r) => r.store === s), cg.filter((r) => r.store === s), [], ref.filter((r) => r.store === s))
    return { store: s, revenue: k.revenue, spend: k.spend, orders: k.orders, roas: k.roas, refundRate: k.refundRate, profit: k.profit }
  }).filter((s) => s.revenue > 0 || s.spend > 0)

  const days: HubDay[] = []
  for (let i = 0; i < 7; i++) {
    const d = amsDate(-1 - i)
    const on = <T extends { date: string }>(rows: T[]) => rows.filter((r) => r.date === d)
    const k = kpiOf(on(rev), on(sp), on(cg), on(ses), on(ref))
    const dayRevSes = on(ses).length ? sum(on(ses), (r) => r.sessions) : null
    days.push({
      date: d, revenue: k.revenue, orders: k.orders, sessions: dayRevSes, cvr: dayRevSes ? (k.orders / dayRevSes) * 100 : null,
      roas: k.roas, be: k.be, spend: k.spend, cogs: k.cogs, cogsPct: k.revenue > 0 ? k.cogsPct : null, refunds: k.refunds, fees: k.fees, profit: k.profit, margin: k.margin,
    })
  }
  return { reportDate, from, to, kpi, stores, days }
}
