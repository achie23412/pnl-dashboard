"use client"
import { useEffect, useState, useMemo } from "react"
import { createClient } from "@supabase/supabase-js"
import { StoreTabs } from "@/components/StoreTabs"
import { DatePicker } from "@/components/DatePicker"
import { KPICards } from "@/components/KPICards"
import { StoreComparison } from "@/components/StoreComparison"
import { DailyTable } from "@/components/DailyTable"
import {
  DailyTrendChart,
  SpendByChannelChart,
  RevenueByStoreChart,
  SpendByAccountChart,
} from "@/components/Charts"
import { AVG_COGS_PER_ORDER, TRANSACTION_FEE_RATE, STORES } from "@/lib/constants"
import type { StoreName } from "@/lib/constants"
import type {
  RevenueRow, SpendRow, CogsRow, SessionsRow, DailyPnL, KPIData,
  RefundRow, StoreKPI, DailyBriefingRow,
} from "@/lib/types"
import { STORE_CURRENCY, COGS_CURRENCY, FALLBACK_RATES, fetchEurRates, toEur } from "@/lib/currency"
import type { EurRates } from "@/lib/currency"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function getDateRange(preset: string, customFrom: string, customTo: string): [string, string] {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  switch (preset) {
    case "today":
      return [fmt(today), fmt(today)]
    case "yesterday": {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      return [fmt(y), fmt(y)]
    }
    case "last_7d": {
      const d = new Date(today)
      d.setDate(d.getDate() - 6)
      return [fmt(d), fmt(today)]
    }
    case "last_30d": {
      const d = new Date(today)
      d.setDate(d.getDate() - 29)
      return [fmt(d), fmt(today)]
    }
    case "this_month": {
      const d = new Date(today.getFullYear(), today.getMonth(), 1)
      return [fmt(d), fmt(today)]
    }
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0)
      return [fmt(start), fmt(end)]
    }
    case "all_time":
      return ["2020-01-01", fmt(today)]
    case "custom":
      return [customFrom || fmt(today), customTo || fmt(today)]
    default:
      return [fmt(new Date(today.getTime() - 29 * 86400000)), fmt(today)]
  }
}

function getPreviousRange(from: string, to: string): [string, string] {
  const f = new Date(from + "T12:00:00")
  const t = new Date(to + "T12:00:00")
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1
  const prevTo = new Date(f.getTime() - 86400000)
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000)
  return [prevFrom.toISOString().slice(0, 10), prevTo.toISOString().slice(0, 10)]
}

export default function Dashboard() {
  const [store, setStore] = useState<StoreName>("Overall")
  const [preset, setPreset] = useState("last_30d")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [revenue, setRevenue] = useState<RevenueRow[]>([])
  const [spend, setSpend] = useState<SpendRow[]>([])
  const [cogs, setCogs] = useState<CogsRow[]>([])
  const [refunds, setRefunds] = useState<RefundRow[]>([])
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [includeTxnFees, setIncludeTxnFees] = useState(false)
  const [rates, setRates] = useState<EurRates>(FALLBACK_RATES)
  const [sessions, setSessions] = useState<SessionsRow[]>([])
  // Details always visible — no toggle needed

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: rev }, { data: sp }, { data: cg }, { data: log }, { data: ses }, { data: ref }] = await Promise.all([
        supabase.from("daily_revenue").select("*").order("date"),
        supabase.from("daily_spend").select("*").order("date"),
        supabase.from("daily_cogs").select("*").order("date"),
        supabase.from("refresh_log").select("completed_at").in("status", ["success", "partial"]).order("completed_at", { ascending: false }).limit(1),
        supabase.from("daily_sessions").select("*").order("date"),
        supabase.from("refunds").select("date,store,amount").order("date"),
      ])
      setSessions((ses as SessionsRow[]) || [])
      const revRows = (rev as RevenueRow[]) || []
      const cogsRows = (cg as CogsRow[]) || []
      const firstDate = [revRows[0]?.date, cogsRows[0]?.date].filter(Boolean).sort()[0]
      const today = new Date().toISOString().slice(0, 10)
      setRates(await fetchEurRates(firstDate || today, today))
      setRevenue(revRows)
      setSpend((sp as SpendRow[]) || [])
      setCogs(cogsRows)
      setRefunds((ref as RefundRow[]) || [])
      if (log && log.length > 0) setLastRefresh(log[0].completed_at)
      setLoading(false)
    }
    load()
  }, [])

  const revenueEur = useMemo(
    () => revenue.map((r) => ({ ...r, revenue: toEur(r.revenue, STORE_CURRENCY[r.store] || "EUR", r.date, rates) })),
    [revenue, rates],
  )
  const cogsEur = useMemo(
    () => cogs.map((r) => ({ ...r, cogs: toEur(r.cogs, COGS_CURRENCY, r.date, rates) })),
    [cogs, rates],
  )
  const estCogsPerOrderEur = (storeName: string, date: string) =>
    toEur(AVG_COGS_PER_ORDER[storeName] || 0, COGS_CURRENCY, date, rates)

  const [dateFrom, dateTo] = getDateRange(preset, customFrom, customTo)
  const [prevFrom, prevTo] = getPreviousRange(dateFrom, dateTo)
  const todayStr = new Date().toISOString().slice(0, 10)
  const showComparison = dateTo < todayStr || preset === "yesterday" || preset === "last_month"

  const filtered = useMemo(() => {
    const inRange = (d: string) => d >= dateFrom && d <= dateTo
    const inPrevRange = (d: string) => d >= prevFrom && d <= prevTo
    const inStore = (s: string) => store === "Overall" || s === store

    return {
      revenue: revenueEur.filter((r) => inRange(r.date) && inStore(r.store)),
      spend: spend.filter((r) => inRange(r.date) && inStore(r.store)),
      cogs: cogsEur.filter((r) => inRange(r.date) && inStore(r.store)),
      sessions: sessions.filter((r) => inRange(r.date) && inStore(r.store)),
      refunds: refunds.filter((r) => inRange(r.date) && inStore(r.store)),
      prevRevenue: revenueEur.filter((r) => inPrevRange(r.date) && inStore(r.store)),
      prevSpend: spend.filter((r) => inPrevRange(r.date) && inStore(r.store)),
      prevCogs: cogsEur.filter((r) => inPrevRange(r.date) && inStore(r.store)),
      prevRefunds: refunds.filter((r) => inPrevRange(r.date) && inStore(r.store)),
    }
  }, [revenueEur, spend, cogsEur, sessions, refunds, dateFrom, dateTo, prevFrom, prevTo, store])

  function computeKPI(
    rev: typeof filtered.revenue,
    sp: typeof filtered.spend,
    cg: typeof filtered.cogs,
    ses: typeof filtered.sessions,
    ref: typeof filtered.refunds,
  ): KPIData {
    const totalRevenue = rev.reduce((s, r) => s + r.revenue, 0)
    const totalOrders = rev.reduce((s, r) => s + r.orders, 0)
    const totalSpend = sp.reduce((s, r) => s + r.spend, 0)
    const actualCogs = cg.reduce((s, r) => s + r.cogs, 0)
    const totalRefundAmount = ref.reduce((s, r) => s + r.amount, 0)

    const cogsDates = new Set(cg.map((r) => `${r.date}|${r.store}`))
    let estCogs = 0
    for (const r of rev) {
      if (!cogsDates.has(`${r.date}|${r.store}`) && AVG_COGS_PER_ORDER[r.store]) {
        estCogs += r.orders * estCogsPerOrderEur(r.store, r.date)
      }
    }
    const totalCogs = actualCogs + estCogs

    let txnFees = 0
    if (includeTxnFees) {
      for (const r of rev) {
        txnFees += r.revenue * (TRANSACTION_FEE_RATE[r.store] || 0.035)
      }
    }

    const profit = totalRevenue - totalSpend - totalCogs - txnFees

    const sessionDays = new Set(ses.map((r) => `${r.date}|${r.store}`))
    const totalSessions = ses.reduce((s, r) => s + r.sessions, 0)
    const ordersWithSessions = rev
      .filter((r) => sessionDays.has(`${r.date}|${r.store}`))
      .reduce((s, r) => s + r.orders, 0)

    return {
      revenue: totalRevenue,
      spend: totalSpend,
      cogs: actualCogs,
      estCogs,
      txnFees,
      profit,
      orders: totalOrders,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      cogsPercent: totalRevenue > 0 ? (totalCogs / totalRevenue) * 100 : 0,
      sessions: totalSessions,
      cvr: totalSessions > 0 ? (ordersWithSessions / totalSessions) * 100 : null,
      refundAmount: totalRefundAmount,
      refundRate: totalRevenue > 0 ? (totalRefundAmount / totalRevenue) * 100 : 0,
    }
  }

  const kpi = useMemo(
    () => computeKPI(filtered.revenue, filtered.spend, filtered.cogs, filtered.sessions, filtered.refunds),
    [filtered, includeTxnFees, rates],
  )

  const prevKpi = useMemo((): KPIData | null => {
    if (!showComparison) return null
    return computeKPI(filtered.prevRevenue, filtered.prevSpend, filtered.prevCogs, [], filtered.prevRefunds)
  }, [filtered, showComparison, includeTxnFees, rates])

  const storeKPIs = useMemo((): StoreKPI[] => {
    if (store !== "Overall") return []
    const storeNames = STORES.filter((s) => s !== "Overall")
    return storeNames.map((s) => {
      const rev = filtered.revenue.filter((r) => r.store === s)
      const sp = filtered.spend.filter((r) => r.store === s)
      const cg = filtered.cogs.filter((r) => r.store === s)
      const ref = filtered.refunds.filter((r) => r.store === s)

      const totalRevenue = rev.reduce((sum, r) => sum + r.revenue, 0)
      const totalSpend = sp.reduce((sum, r) => sum + r.spend, 0)
      const totalRefund = ref.reduce((sum, r) => sum + r.amount, 0)
      const actualCog = cg.reduce((sum, r) => sum + r.cogs, 0)

      const cogsDates = new Set(cg.map((r) => r.date))
      let est = 0
      for (const r of rev) {
        if (!cogsDates.has(r.date) && AVG_COGS_PER_ORDER[s]) {
          est += r.orders * estCogsPerOrderEur(s, r.date)
        }
      }
      const totalCog = actualCog + est

      let txn = 0
      if (includeTxnFees) {
        for (const r of rev) txn += r.revenue * (TRANSACTION_FEE_RATE[s] || 0.035)
      }

      return {
        store: s,
        revenue: totalRevenue,
        orders: rev.reduce((sum, r) => sum + r.orders, 0),
        spend: totalSpend,
        roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        refundAmount: totalRefund,
        refundRate: totalRevenue > 0 ? (totalRefund / totalRevenue) * 100 : 0,
        profit: totalRevenue - totalSpend - totalCog - txn,
      }
    }).filter((s) => s.revenue > 0 || s.spend > 0)
  }, [filtered, store, includeTxnFees, rates])

  const dailyBriefing = useMemo((): DailyBriefingRow[] => {
    const dates = new Set([
      ...filtered.revenue.map((r) => r.date),
      ...filtered.spend.map((r) => r.date),
      ...filtered.cogs.map((r) => r.date),
    ])

    const revByDate = new Map<string, { revenue: number; orders: number }>()
    for (const r of filtered.revenue) {
      const entry = revByDate.get(r.date) || { revenue: 0, orders: 0 }
      entry.revenue += r.revenue
      entry.orders += r.orders
      revByDate.set(r.date, entry)
    }

    const spendByDate = new Map<string, number>()
    for (const r of filtered.spend) spendByDate.set(r.date, (spendByDate.get(r.date) || 0) + r.spend)

    const cogsByDate = new Map<string, number>()
    const cogsDateStores = new Set<string>()
    for (const r of filtered.cogs) {
      cogsByDate.set(r.date, (cogsByDate.get(r.date) || 0) + r.cogs)
      cogsDateStores.add(`${r.date}|${r.store}`)
    }

    const refundByDate = new Map<string, number>()
    for (const r of filtered.refunds) refundByDate.set(r.date, (refundByDate.get(r.date) || 0) + r.amount)

    return Array.from(dates)
      .sort()
      .map((date) => {
        const rev = revByDate.get(date) || { revenue: 0, orders: 0 }
        const sp = spendByDate.get(date) || 0
        const actualCog = cogsByDate.get(date) || 0
        const refAmt = refundByDate.get(date) || 0

        let est = 0
        for (const r of filtered.revenue.filter((x) => x.date === date)) {
          if (!cogsDateStores.has(`${r.date}|${r.store}`) && AVG_COGS_PER_ORDER[r.store]) {
            est += r.orders * estCogsPerOrderEur(r.store, r.date)
          }
        }
        const totalCog = actualCog + est

        let dayTxn = 0
        if (includeTxnFees) {
          for (const r of filtered.revenue.filter((x) => x.date === date)) {
            dayTxn += r.revenue * (TRANSACTION_FEE_RATE[r.store] || 0.035)
          }
        }

        return {
          date,
          revenue: Math.round(rev.revenue),
          orders: rev.orders,
          spend: Math.round(sp),
          roas: sp > 0 ? rev.revenue / sp : 0,
          refundAmount: Math.round(refAmt),
          refundRate: rev.revenue > 0 ? (refAmt / rev.revenue) * 100 : 0,
          cogs: Math.round(totalCog),
          profit: Math.round(rev.revenue - sp - totalCog - dayTxn),
          isToday: date === todayStr,
        }
      })
  }, [filtered, includeTxnFees, rates, todayStr])

  const dailyPnL = useMemo((): DailyPnL[] => {
    return dailyBriefing.map((row) => ({
      date: row.date,
      revenue: row.revenue,
      spend: row.spend,
      cogs: row.cogs,
      estCogs: 0,
      profit: row.profit,
      orders: row.orders,
    }))
  }, [dailyBriefing])

  return (
    <main className="min-h-screen p-6 md:p-8 lg:p-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[18px] font-bold tracking-tight" style={{ color: "var(--text)" }}>Command Center</h1>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)" }}>
            {lastRefresh
              ? `Last refresh: ${new Date(lastRefresh).toLocaleString()}`
              : "Start every day here."}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onChange={(p, f, t) => {
              setPreset(p)
              if (f) setCustomFrom(f)
              if (t) setCustomTo(t)
            }}
          />
        </div>
      </div>

      <div className="mb-4">
        <StoreTabs active={store} onChange={setStore} />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="relative w-8 h-8">
            <div
              className="absolute inset-0 rounded-full animate-spin"
              style={{ border: "2px solid rgba(255,255,255,0.06)", borderTopColor: "var(--accent)" }}
            />
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Loading</span>
        </div>
      ) : (
        <>
          <div className="mb-5">
            <div className="flex items-center justify-end gap-1.5 mb-2.5">
              <span className="text-[9px] uppercase tracking-wider font-medium" style={{ color: "var(--text-dim)" }}>Transaction fees (3.5%)</span>
              <button
                onClick={() => setIncludeTxnFees(!includeTxnFees)}
                className="relative w-7 h-4 rounded-full transition-all"
                style={{ background: includeTxnFees ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)" }}
              >
                <span
                  className="absolute top-[2px] left-[2px] w-3 h-3 rounded-full transition-transform"
                  style={{
                    background: includeTxnFees ? "#c7d2fe" : "rgba(255,255,255,0.3)",
                    transform: includeTxnFees ? "translateX(12px)" : "translateX(0)",
                  }}
                />
              </button>
            </div>
            <KPICards data={kpi} prevData={showComparison ? prevKpi : null} includeTxnFees={includeTxnFees} />
          </div>

          {store === "Overall" && storeKPIs.length > 0 && (
            <div className="mb-5">
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-dim)" }}>
                Compare stores
              </div>
              <StoreComparison stores={storeKPIs} />
            </div>
          )}

          <div className="mb-5">
            <div className="text-[9px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-dim)" }}>
              Per-day breakdown
            </div>
            <DailyTable data={dailyBriefing} />
          </div>

          <div className="mb-5">
            <DailyTrendChart data={dailyPnL} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
            <SpendByChannelChart data={filtered.spend} />
            {store === "Overall" ? (
              <RevenueByStoreChart data={filtered.revenue} />
            ) : (
              <SpendByAccountChart data={filtered.spend} />
            )}
          </div>

          <div
            className="text-center text-[9px] py-3"
            style={{ color: "var(--text-dim)" }}
          >
            All amounts in EUR · Lumé &amp; S&amp;A revenue converted from USD, C&amp;C from GBP, COGS from USD at the daily ECB rate
            {rates.fallback
              ? " (rate service unreachable: using €1 = $1.11 / £0.835)"
              : ` (latest €1 = $${rates.byDate[rates.dates[rates.dates.length - 1]].USD.toFixed(4)} / £${rates.byDate[rates.dates[rates.dates.length - 1]].GBP.toFixed(4)})`}
            {kpi.estCogs > 0 && (
              <span style={{ color: "var(--orange)" }}> · Estimated COGS active for missing data</span>
            )}
          </div>
        </>
      )}
    </main>
  )
}
