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
import { AVG_COGS_PER_ORDER } from "@/lib/constants"
import type { StoreName } from "@/lib/constants"
import type { RevenueRow, SpendRow, CogsRow, DailyPnL, KPIData } from "@/lib/types"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const USD_TO_EUR = 0.92

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

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: rev }, { data: sp }, { data: cg }, { data: log }] = await Promise.all([
        supabase.from("daily_revenue").select("*").order("date"),
        supabase.from("daily_spend").select("*").order("date"),
        supabase.from("daily_cogs").select("*").order("date"),
        supabase.from("refresh_log").select("completed_at").in("status", ["success", "partial"]).order("completed_at", { ascending: false }).limit(1),
      ])
      setRevenue((rev as RevenueRow[]) || [])
      setSpend((sp as SpendRow[]) || [])
      setCogs((cg as CogsRow[]) || [])
      if (log && log.length > 0) setLastRefresh(log[0].completed_at)
      setLoading(false)
    }
    load()
  }, [])

  const [dateFrom, dateTo] = getDateRange(preset, customFrom, customTo)

  const filtered = useMemo(() => {
    const inRange = (d: string) => d >= dateFrom && d <= dateTo
    const inStore = (s: string) => store === "Overall" || s === store

    const fr = revenue.filter((r) => inRange(r.date) && inStore(r.store))
    const fs = spend.filter((r) => inRange(r.date) && inStore(r.store))
    const fc = cogs.filter((r) => inRange(r.date) && inStore(r.store))

    return { revenue: fr, spend: fs, cogs: fc }
  }, [revenue, spend, cogs, dateFrom, dateTo, store])

  const kpi = useMemo((): KPIData => {
    const totalRevenue = filtered.revenue.reduce((s, r) => s + r.revenue, 0)
    const totalOrders = filtered.revenue.reduce((s, r) => s + r.orders, 0)
    const totalSpend = filtered.spend.reduce((s, r) => s + r.spend, 0)
    const actualCogs = filtered.cogs.reduce((s, r) => s + r.cogs, 0)

    const cogsDates = new Set(filtered.cogs.map((r) => `${r.date}|${r.store}`))
    let estCogs = 0
    for (const r of filtered.revenue) {
      if (!cogsDates.has(`${r.date}|${r.store}`) && AVG_COGS_PER_ORDER[r.store]) {
        estCogs += r.orders * AVG_COGS_PER_ORDER[r.store]
      }
    }

    const totalCogs = actualCogs + estCogs
    const cogsEur = totalCogs * USD_TO_EUR
    const profit = totalRevenue - totalSpend - cogsEur

    return {
      revenue: totalRevenue,
      spend: totalSpend,
      cogs: actualCogs,
      estCogs,
      profit,
      orders: totalOrders,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      cogsPercent: totalRevenue > 0 ? (cogsEur / totalRevenue) * 100 : 0,
    }
  }, [filtered])

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
            est += r.orders * AVG_COGS_PER_ORDER[r.store]
          }
        }

        const totalCog = (actualCog + est) * USD_TO_EUR
        return {
          date,
          revenue: Math.round(rev.revenue),
          spend: Math.round(sp),
          cogs: Math.round(totalCog),
          estCogs: Math.round(est * USD_TO_EUR),
          profit: Math.round(rev.revenue - sp - totalCog),
          orders: rev.orders,
        }
      })
  }, [filtered])

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
            <KPICards data={kpi} />
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
            COGS in USD (€1 = ${(1 / USD_TO_EUR).toFixed(2)}) · Lumé avg $14.59/order · Blinky avg $18.87/order
            {kpi.estCogs > 0 && (
              <span style={{ color: "var(--orange)" }}> · Estimated COGS active for missing data</span>
            )}
          </div>
        </>
      )}
    </main>
  )
}
