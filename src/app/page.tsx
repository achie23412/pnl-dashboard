"use client"
import { useEffect, useState, useMemo } from "react"
import { createClient } from "@supabase/supabase-js"
import { StoreTabs } from "@/components/StoreTabs"
import { DatePicker } from "@/components/DatePicker"
import { KPICards } from "@/components/KPICards"
import {
  DailyTrendChart,
  SpendByChannelChart,
  RevenueByStoreChart,
  SpendByAccountChart,
} from "@/components/Charts"
import { AVG_COGS_PER_ORDER, TRANSACTION_FEE_RATE } from "@/lib/constants"
import type { StoreName } from "@/lib/constants"
import type { RevenueRow, SpendRow, CogsRow, SessionsRow, DailyPnL, KPIData } from "@/lib/types"
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

export default function Dashboard() {
  const [store, setStore] = useState<StoreName>("Overall")
  const [preset, setPreset] = useState("last_30d")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [revenue, setRevenue] = useState<RevenueRow[]>([])
  const [spend, setSpend] = useState<SpendRow[]>([])
  const [cogs, setCogs] = useState<CogsRow[]>([])
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [includeTxnFees, setIncludeTxnFees] = useState(false)
  const [rates, setRates] = useState<EurRates>(FALLBACK_RATES)
  const [sessions, setSessions] = useState<SessionsRow[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: rev }, { data: sp }, { data: cg }, { data: log }, { data: ses }] = await Promise.all([
        supabase.from("daily_revenue").select("*").order("date"),
        supabase.from("daily_spend").select("*").order("date"),
        supabase.from("daily_cogs").select("*").order("date"),
        supabase.from("refresh_log").select("completed_at").in("status", ["success", "partial"]).order("completed_at", { ascending: false }).limit(1),
        supabase.from("daily_sessions").select("*").order("date"),
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
      if (log && log.length > 0) setLastRefresh(log[0].completed_at)
      setLoading(false)
    }
    load()
  }, [])

  // Everything in EUR: revenue converted from each shop's currency, COGS from USD.
  // Ad spend is already EUR in all ad accounts.
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

  const filtered = useMemo(() => {
    const inRange = (d: string) => d >= dateFrom && d <= dateTo
    const inStore = (s: string) => store === "Overall" || s === store

    const fr = revenueEur.filter((r) => inRange(r.date) && inStore(r.store))
    const fs = spend.filter((r) => inRange(r.date) && inStore(r.store))
    const fc = cogsEur.filter((r) => inRange(r.date) && inStore(r.store))
    const fses = sessions.filter((r) => inRange(r.date) && inStore(r.store))

    return { revenue: fr, spend: fs, cogs: fc, sessions: fses }
  }, [revenueEur, spend, cogsEur, sessions, dateFrom, dateTo, store])

  const kpi = useMemo((): KPIData => {
    const totalRevenue = filtered.revenue.reduce((s, r) => s + r.revenue, 0)
    const totalOrders = filtered.revenue.reduce((s, r) => s + r.orders, 0)
    const totalSpend = filtered.spend.reduce((s, r) => s + r.spend, 0)
    const actualCogs = filtered.cogs.reduce((s, r) => s + r.cogs, 0)

    const cogsDates = new Set(filtered.cogs.map((r) => `${r.date}|${r.store}`))
    let estCogs = 0
    for (const r of filtered.revenue) {
      if (!cogsDates.has(`${r.date}|${r.store}`) && AVG_COGS_PER_ORDER[r.store]) {
        estCogs += r.orders * estCogsPerOrderEur(r.store, r.date)
      }
    }

    const totalCogs = actualCogs + estCogs

    let txnFees = 0
    if (includeTxnFees) {
      for (const r of filtered.revenue) {
        const rate = TRANSACTION_FEE_RATE[r.store] || 0.035
        txnFees += r.revenue * rate
      }
    }

    const profit = totalRevenue - totalSpend - totalCogs - txnFees

    // Store CVR: only count orders on store-days that have session data,
    // so a store without a Shopify token doesn't inflate the rate.
    const sessionDays = new Set(filtered.sessions.map((r) => `${r.date}|${r.store}`))
    const totalSessions = filtered.sessions.reduce((s, r) => s + r.sessions, 0)
    const ordersWithSessions = filtered.revenue
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
    }
  }, [filtered, includeTxnFees, rates])

  const dailyPnL = useMemo((): DailyPnL[] => {
    const dates = new Set([
      ...filtered.revenue.map((r) => r.date),
      ...filtered.spend.map((r) => r.date),
      ...filtered.cogs.map((r) => r.date),
    ])

    const revByDate = new Map<string, { revenue: number; orders: number; stores: Set<string> }>()
    for (const r of filtered.revenue) {
      const entry = revByDate.get(r.date) || { revenue: 0, orders: 0, stores: new Set() }
      entry.revenue += r.revenue
      entry.orders += r.orders
      entry.stores.add(r.store)
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

    return Array.from(dates)
      .sort()
      .map((date) => {
        const rev = revByDate.get(date) || { revenue: 0, orders: 0, stores: new Set<string>() }
        const sp = spendByDate.get(date) || 0
        const actualCog = cogsByDate.get(date) || 0

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
          spend: Math.round(sp),
          cogs: Math.round(totalCog),
          estCogs: Math.round(est),
          profit: Math.round(rev.revenue - sp - totalCog - dayTxn),
          orders: rev.orders,
        }
      })
  }, [filtered, includeTxnFees, rates])

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold">P&L Dashboard</h1>
          {lastRefresh && (
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Last refresh: {new Date(lastRefresh).toLocaleString()}
            </div>
          )}
        </div>
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

      <div className="mb-6">
        <StoreTabs active={store} onChange={setStore} />
      </div>

      {loading ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>
          Loading dashboard data...
        </div>
      ) : (
        <>
          <div className="mb-6">
            <div className="flex items-center justify-end gap-2 mb-3">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Transaction fees (3.5%)</span>
              <button
                onClick={() => setIncludeTxnFees(!includeTxnFees)}
                className="relative w-9 h-5 rounded-full transition-colors"
                style={{ background: includeTxnFees ? "#4E6AA7" : "var(--border)" }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform"
                  style={{ background: "#fff", transform: includeTxnFees ? "translateX(16px)" : "translateX(0)" }}
                />
              </button>
            </div>
            <KPICards data={kpi} includeTxnFees={includeTxnFees} />
          </div>

          <div className="mb-6">
            <DailyTrendChart data={dailyPnL} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <SpendByChannelChart data={filtered.spend} />
            {store === "Overall" ? (
              <RevenueByStoreChart data={filtered.revenue} />
            ) : (
              <SpendByAccountChart data={filtered.spend} />
            )}
          </div>

          <div
            className="text-center text-xs py-4"
            style={{ color: "var(--text-muted)" }}
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
