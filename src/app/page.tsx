"use client"
import { useEffect, useState, useMemo } from "react"
import { db } from "@/lib/db-client"
import { StoreTabs } from "@/components/StoreTabs"
import { DatePicker } from "@/components/DatePicker"
import { FixBanner } from "@/components/FixBanner"
import { KPICards } from "@/components/KPICards"
import { StoreComparison } from "@/components/StoreComparison"
import { DailyTable } from "@/components/DailyTable"
import { RoasAlertDetail } from "@/components/RoasAlertDetail"
import {
  DailyTrendChart,
  SpendByChannelChart,
  RevenueByStoreChart,
  SpendByAccountChart,
} from "@/components/Charts"
import { AVG_COGS_PER_ORDER, TRANSACTION_FEE_RATE, MEDIA_BUYER_FEE_RATE, STORES, breakEvenRoas } from "@/lib/constants"
import type { StoreName } from "@/lib/constants"
import type {
  RevenueRow, SpendRow, CogsRow, SessionsRow, DailyPnL, KPIData,
  RefundRow, StoreKPI, DailyBriefingRow, CogsConfidence,
} from "@/lib/types"
import { STORE_CURRENCY, COGS_CURRENCY, AD_SPEND_CURRENCY, FALLBACK_RATES, fetchEurRates, toEur } from "@/lib/currency"
import type { EurRates } from "@/lib/currency"
import { getCached, setCache } from "@/lib/cache"
import { getDateRange } from "@/lib/date-range"

// Database reads go through our logged-in server (/api/db), not the public Supabase key
const supabase = db

function getPreviousRange(from: string, to: string): [string, string] {
  const f = new Date(from + "T12:00:00")
  const t = new Date(to + "T12:00:00")
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1
  const prevTo = new Date(f.getTime() - 86400000)
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000)
  return [prevFrom.toISOString().slice(0, 10), prevTo.toISOString().slice(0, 10)]
}

type RoasAlert = {
  store: string
  recentRoas: number
  baselineRoas: number
  breakevenRoas: number
  drop: number
  severity: "loss" | "thin" | "ok"
  recentFrom: string
  baselineFrom: string
}

// loss = last 3 days below break-even ROAS (losing money)
// thin = above break-even but less than 20% headroom
// ok   = dropped, but still comfortably profitable
const ALERT_TONE: Record<RoasAlert["severity"], { color: string; bg: string; border: string; label: string }> = {
  loss: { color: "var(--red)", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.25)", label: "below break-even, losing money" },
  thin: { color: "var(--orange)", bg: "rgba(212,144,58,0.1)", border: "rgba(212,144,58,0.25)", label: "close to break-even" },
  ok: { color: "#94a3b8", bg: "rgba(148,163,184,0.07)", border: "rgba(148,163,184,0.18)", label: "still profitable" },
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
  // Fees on by default, like the profit sheet (transaction fee + media buyer fee)
  const [includeTxnFees, setIncludeTxnFees] = useState(true)
  const [rates, setRates] = useState<EurRates>(FALLBACK_RATES)
  const [sessions, setSessions] = useState<SessionsRow[]>([])
  // Details always visible — no toggle needed

  useEffect(() => {
    async function load() {
      const cached = getCached<{
        rev: RevenueRow[]; sp: SpendRow[]; cg: CogsRow[];
        ses: SessionsRow[]; ref: RefundRow[]; lr: string | null; rt: EurRates
      }>("hub-data")

      if (cached) {
        setRevenue(cached.rev)
        setSpend(cached.sp)
        setCogs(cached.cg)
        setSessions(cached.ses)
        setRefunds(cached.ref)
        setLastRefresh(cached.lr)
        setRates(cached.rt)
        setLoading(false)
        return
      }

      setLoading(true)
      const [{ data: rev }, { data: sp }, { data: cg }, { data: log }, { data: ses }, { data: ref }] = await Promise.all([
        supabase.from("daily_revenue").select("*").order("date"),
        supabase.from("daily_spend").select("*").order("date"),
        supabase.from("daily_cogs").select("*").order("date"),
        supabase.from("refresh_log").select("completed_at").in("status", ["success", "partial"]).order("completed_at", { ascending: false }).limit(1),
        supabase.from("daily_sessions").select("*").order("date"),
        supabase.from("refunds").select("date,store,amount").order("date"),
      ])
      const revRows = (rev as RevenueRow[]) || []
      const spRows = (sp as SpendRow[]) || []
      const cogsRows = (cg as CogsRow[]) || []
      const sesRows = (ses as SessionsRow[]) || []
      const refRows = (ref as RefundRow[]) || []
      const lr = log?.[0]?.completed_at || null
      const firstDate = [revRows[0]?.date, cogsRows[0]?.date].filter(Boolean).sort()[0]
      const today = new Date().toISOString().slice(0, 10)
      const rt = await fetchEurRates(firstDate || today, today)

      setCache("hub-data", { rev: revRows, sp: spRows, cg: cogsRows, ses: sesRows, ref: refRows, lr, rt })
      setSessions(sesRows)
      setRevenue(revRows)
      setSpend(spRows)
      setCogs(cogsRows)
      setRefunds(refRows)
      setLastRefresh(lr)
      setRates(rt)
      setLoading(false)
    }
    load()
  }, [])

  const revenueEur = useMemo(
    () => revenue.map((r) => ({ ...r, revenue: toEur(r.revenue, STORE_CURRENCY[r.store] || "EUR", r.date, rates) })),
    [revenue, rates],
  )
  const spendEur = useMemo(
    () => spend.map((r) => ({ ...r, spend: toEur(r.spend, AD_SPEND_CURRENCY, r.date, rates) })),
    [spend, rates],
  )
  const cogsEur = useMemo(
    () => cogs.map((r) => ({ ...r, cogs: toEur(r.cogs, COGS_CURRENCY, r.date, rates) })),
    [cogs, rates],
  )
  const refundsEur = useMemo(
    () => refunds.map((r) => ({ ...r, amount: toEur(Number(r.amount) || 0, STORE_CURRENCY[r.store] || "EUR", r.date, rates) })),
    [refunds, rates],
  )
  const estCogsPerOrderEur =(storeName: string, date: string) =>
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
      spend: spendEur.filter((r) => inRange(r.date) && inStore(r.store)),
      cogs: cogsEur.filter((r) => inRange(r.date) && inStore(r.store)),
      sessions: sessions.filter((r) => inRange(r.date) && inStore(r.store)),
      refunds: refundsEur.filter((r) => inRange(r.date) && inStore(r.store)),
      prevRevenue: revenueEur.filter((r) => inPrevRange(r.date) && inStore(r.store)),
      prevSpend: spendEur.filter((r) => inPrevRange(r.date) && inStore(r.store)),
      prevCogs: cogsEur.filter((r) => inPrevRange(r.date) && inStore(r.store)),
      prevRefunds: refundsEur.filter((r) => inPrevRange(r.date) && inStore(r.store)),
    }
  }, [revenueEur, spendEur, cogsEur, sessions, refundsEur, dateFrom, dateTo, prevFrom, prevTo, store])

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

    let mediaBuyerFees = 0
    if (includeTxnFees) {
      for (const r of sp) mediaBuyerFees += r.spend * (MEDIA_BUYER_FEE_RATE[r.store] ?? 0)
    }

    // Revenue is gross (order rows only); refunds are subtracted here.
    const profit = totalRevenue - totalRefundAmount - totalSpend - totalCogs - txnFees - mediaBuyerFees

    const sessionDays = new Set(ses.map((r) => `${r.date}|${r.store}`))
    const totalSessions = ses.reduce((s, r) => s + r.sessions, 0)
    const ordersWithSessions = rev
      .filter((r) => sessionDays.has(`${r.date}|${r.store}`))
      .reduce((s, r) => s + r.orders, 0)

    const cogsPercent = totalRevenue > 0 ? (totalCogs / totalRevenue) * 100 : 0
    let weightedTxnRate = 0
    if (totalRevenue > 0) {
      for (const r of rev) {
        weightedTxnRate += (r.revenue / totalRevenue) * (TRANSACTION_FEE_RATE[r.store] || 0.035)
      }
    }
    const mbRate = totalSpend > 0 ? sp.reduce((s, r) => s + r.spend * (MEDIA_BUYER_FEE_RATE[r.store] ?? 0), 0) / totalSpend : 0
    const be = breakEvenRoas(cogsPercent / 100, weightedTxnRate, mbRate)
    const breakevenRoas = Number.isFinite(be) ? be : 0

    const cogsConfidence: CogsConfidence =
      actualCogs > 0 && estCogs === 0 ? "actual"
      : actualCogs > 0 && estCogs > 0 ? "partial"
      : "estimated"

    return {
      revenue: totalRevenue,
      spend: totalSpend,
      cogs: actualCogs,
      estCogs,
      txnFees,
      mediaBuyerFees,
      profit,
      orders: totalOrders,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      cogsPercent,
      sessions: totalSessions,
      cvr: totalSessions > 0 ? (ordersWithSessions / totalSessions) * 100 : null,
      refundAmount: totalRefundAmount,
      refundRate: totalRevenue > 0 ? (totalRefundAmount / totalRevenue) * 100 : 0,
      breakevenRoas,
      cogsConfidence,
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
        txn += totalSpend * (MEDIA_BUYER_FEE_RATE[s] ?? 0)
      }

      return {
        store: s,
        revenue: totalRevenue,
        orders: rev.reduce((sum, r) => sum + r.orders, 0),
        spend: totalSpend,
        roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        refundAmount: totalRefund,
        refundRate: totalRevenue > 0 ? (totalRefund / totalRevenue) * 100 : 0,
        profit: totalRevenue - totalRefund - totalSpend - totalCog - txn,
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
          for (const r of filtered.spend.filter((x) => x.date === date)) {
            dayTxn += r.spend * (MEDIA_BUYER_FEE_RATE[r.store] ?? 0)
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
          profit: Math.round(rev.revenue - refAmt - sp - totalCog - dayTxn),
          isToday: date === todayStr,
        }
      })
  }, [filtered, includeTxnFees, rates, todayStr])

  // ROAS trend alerts: judge trends, not single days. Today (live, partial) is
  // excluded. Compares the last ALERT_RECENT_DAYS complete days with the
  // ALERT_BASELINE_DAYS complete days before that, independent of the date picker.
  const roasAlerts = useMemo(() => {
    const ALERT_RECENT_DAYS = 3
    const ALERT_BASELINE_DAYS = 7
    const MIN_RECENT_SPEND = 30
    const dayStr = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)
    const recentFrom = dayStr(ALERT_RECENT_DAYS)
    const baselineFrom = dayStr(ALERT_RECENT_DAYS + ALERT_BASELINE_DAYS)
    const inRecent = (d: string) => d >= recentFrom && d < todayStr
    const inBaseline = (d: string) => d >= baselineFrom && d < recentFrom

    const alerts: RoasAlert[] = []
    const storeNames = store === "Overall" ? STORES.filter((s) => s !== "Overall") : [store]
    const inWindow = (d: string) => d >= baselineFrom && d < todayStr
    for (const s of storeNames) {
      const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((a, r) => a + pick(r), 0)
      const rRev = sum(revenueEur.filter((r) => r.store === s && inRecent(r.date)), (r) => r.revenue)
      const rSpend = sum(spendEur.filter((r) => r.store === s && inRecent(r.date)), (r) => r.spend)
      const bRev = sum(revenueEur.filter((r) => r.store === s && inBaseline(r.date)), (r) => r.revenue)
      const bSpend = sum(spendEur.filter((r) => r.store === s && inBaseline(r.date)), (r) => r.spend)
      if (rSpend < MIN_RECENT_SPEND || bSpend <= 0) continue
      const recentRoas = rRev / rSpend
      const baselineRoas = bRev / bSpend
      if (!(baselineRoas > 0 && recentRoas < baselineRoas * 0.7)) continue

      // Store break-even ROAS over the whole 10-day window (more stable than 3 days):
      // COGS % (actual, else estimated per order) + transaction fee rate.
      const wRev = revenueEur.filter((r) => r.store === s && inWindow(r.date))
      const wCogs = cogsEur.filter((r) => r.store === s && inWindow(r.date))
      const cogsDays = new Set(wCogs.map((r) => r.date))
      const revTotal = sum(wRev, (r) => r.revenue)
      const cogsTotal =
        sum(wCogs, (r) => r.cogs) +
        sum(wRev.filter((r) => !cogsDays.has(r.date) && AVG_COGS_PER_ORDER[s]), (r) => r.orders * estCogsPerOrderEur(s, r.date))
      const breakevenRoas = breakEvenRoas(revTotal > 0 ? cogsTotal / revTotal : 0, TRANSACTION_FEE_RATE[s] || 0.035, MEDIA_BUYER_FEE_RATE[s] ?? 0)

      const severity: RoasAlert["severity"] =
        recentRoas < breakevenRoas ? "loss" : recentRoas < breakevenRoas * 1.2 ? "thin" : "ok"
      alerts.push({
        store: s, recentRoas, baselineRoas, breakevenRoas, severity, recentFrom, baselineFrom,
        drop: ((baselineRoas - recentRoas) / baselineRoas) * 100,
      })
    }
    const rank = { loss: 0, thin: 1, ok: 2 }
    return alerts.sort((a, b) => rank[a.severity] - rank[b.severity])
  }, [revenueEur, spendEur, cogsEur, store, todayStr, rates])

  // Dismissed alerts stay hidden for the rest of the day; they come back tomorrow if the drop is still there.
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([])
  const dismissKey = `roas-alerts-dismissed-${todayStr}`
  useEffect(() => {
    try {
      setDismissedAlerts(JSON.parse(localStorage.getItem(dismissKey) || "[]"))
    } catch {
      setDismissedAlerts([])
    }
  }, [dismissKey])
  const dismissAlert = (s: string) => {
    const next = [...dismissedAlerts, s]
    setDismissedAlerts(next)
    try {
      localStorage.setItem(dismissKey, JSON.stringify(next))
    } catch {}
  }
  const visibleAlerts = roasAlerts.filter((a) => !dismissedAlerts.includes(a.store))
  const [openAlert, setOpenAlert] = useState<string | null>(null)

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
          <h1 className="text-[18px] font-bold tracking-tight" style={{ color: "var(--text)" }}>Main Hub</h1>
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

      <FixBanner onApply={(ctx) => {
        if (ctx.store) {
          const match = STORES.find((s) => s === ctx.store)
          if (match) setStore(match)
        }
      }} />

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
          {rates.fallback && (
            <div
              className="rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-[11px] font-medium" style={{ color: "var(--orange)" }}>
                ECB rate service unreachable — using fallback rates (€1 = $1.11 / £0.835). Amounts may differ slightly from actual.
              </span>
            </div>
          )}

          <div className="mb-5">
            <div className="flex items-center justify-end gap-1.5 mb-2.5">
              <span className="text-[9px] uppercase tracking-wider font-medium" style={{ color: "var(--text-dim)" }} title="Transaction fee (6% Google stores, 2.9% Meta stores) + media buyer fee (10% of Google ad spend), as in the profit sheet">Fees (profit sheet)</span>
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

          {visibleAlerts.length > 0 && (
            <div className="space-y-2 mb-4">
              {visibleAlerts.map((a) => {
                const tone = ALERT_TONE[a.severity]
                const be = Number.isFinite(a.breakevenRoas) ? `${a.breakevenRoas.toFixed(2)}x` : "n/a"
                const isOpen = openAlert === a.store
                return (
                  <div
                    key={a.store}
                    className="rounded-xl"
                    style={{ background: tone.bg, border: `1px solid ${tone.border}` }}
                  >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => setOpenAlert(isOpen ? null : a.store)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setOpenAlert(isOpen ? null : a.store)
                      }
                    }}
                    title={isOpen ? "Hide details" : "Show why this happened"}
                    className="pl-4 pr-2 py-2 flex items-center gap-2 cursor-pointer"
                  >
                    <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tone.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
                    </svg>
                    <span className="text-[11px] font-medium flex-1" style={{ color: tone.color }}>
                      {a.store} ROAS down {a.drop.toFixed(0)}% — last 3 days {a.recentRoas.toFixed(2)}x vs {a.baselineRoas.toFixed(2)}x the 7 days before
                      <span style={{ opacity: 0.75 }}> · {tone.label} (break-even {be})</span>
                    </span>
                    <span className="shrink-0 text-[10px] flex items-center gap-1" style={{ color: tone.color, opacity: 0.8 }}>
                      {isOpen ? "Hide" : "Why?"}
                      <svg
                        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform 150ms" }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        dismissAlert(a.store)
                      }}
                      aria-label={`Dismiss ${a.store} alert`}
                      title="Hide for today"
                      className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-opacity opacity-60 hover:opacity-100"
                      style={{ color: tone.color }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  {isOpen && (
                    <RoasAlertDetail
                      store={a.store}
                      revenue={revenueEur.filter((r) => r.store === a.store)}
                      spend={spendEur.filter((r) => r.store === a.store)}
                      sessions={sessions.filter((r) => r.store === a.store)}
                      baselineFrom={a.baselineFrom}
                      recentFrom={a.recentFrom}
                      todayStr={todayStr}
                      recentDays={3}
                      baselineDays={7}
                      breakevenRoas={a.breakevenRoas}
                      color={tone.color}
                    />
                  )}
                  </div>
                )
              })}
            </div>
          )}

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
