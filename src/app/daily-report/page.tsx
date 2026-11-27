"use client"
import { useEffect, useState, useMemo } from "react"
import { db } from "@/lib/db-client"
import { STORES, AVG_COGS_PER_ORDER, TRANSACTION_FEE_RATE, STORE_TIMEZONE, STORE_MARKET, dropStopped, stoppedWithData, breakEvenRoas } from "@/lib/constants"
import { mediaBuyerRate } from "@/lib/fee-settings"
import { useFeeSettings } from "@/lib/use-fee-settings"
import { STORE_CURRENCY, COGS_CURRENCY, fetchEurRates, toEur, FALLBACK_RATES } from "@/lib/currency"
import type { EurRates } from "@/lib/currency"
import type { RevenueRow, SpendRow, CogsRow, RefundRow } from "@/lib/types"
import { FixBanner } from "@/components/FixBanner"
import { PageShell } from "@/components/PageShell"
import { DatePicker } from "@/components/DatePicker"
import { getDateRange } from "@/lib/date-range"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { FilterBar } from "@/components/PillSelect"
import { Panel, Badge, Button, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"

// Database reads go through our logged-in server (/api/db), not the public Supabase key
const supabase = db

function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

function getLocalDate(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz })
}

function getLocalTime(tz: string): string {
  return new Date().toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })
}

interface StoreRow {
  store: string
  revenue: number
  orders: number
  sessions: number | null
  cvr: number | null
  spend: number
  roas: number
  cogs: number
  refunds: number
  profit: number
  txnFee: number
  mbFee: number
  cogsPending: number // orders without a ShipGoods price yet (average used)
  spendByChannel: Record<string, number>
}

interface OrderCogsRow { store: string; cogs_usd: number; priced: number; pending: number }

interface AdPerfRow {
  store: string
  channel: string
  spend: number
  clicks: number
  impressions: number
  ctr: number
  cpc: number
}

export default function DailyReportPage() {
  // Date range, same picker and presets as the Main Hub (one day = from and to the same day)
  const [preset, setPreset] = useState("today")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [from, to] = getDateRange(preset, customFrom, customTo)
  const date = to // the range's last day (rates, single-day labels)
  const oneDay = from === to
  const nDays = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
  const setRange = (f: string, t: string) => {
    setPreset("custom")
    setCustomFrom(f)
    setCustomTo(t)
  }
  const [revenue, setRevenue] = useState<RevenueRow[]>([])
  const [spend, setSpend] = useState<SpendRow[]>([])
  const [cogs, setCogs] = useState<CogsRow[]>([])
  const [refunds, setRefunds] = useState<RefundRow[]>([])
  const [sessions, setSessions] = useState<{ store: string; sessions: number }[]>([])
  const [adPerf, setAdPerf] = useState<AdPerfRow[]>([])
  // Include or exclude stores: the table, the totals and Ad Performance only count these
  const [fStore, setFStoreState] = useState<FilterValue>(EMPTY_FILTER)
  // remembered in this browser
  useEffect(() => {
    try {
      const v = localStorage.getItem("daily-report:stores")
      if (v) setFStoreState(JSON.parse(v) as FilterValue)
    } catch {
      // optional
    }
  }, [])
  const setFStore = (f: FilterValue) => {
    setFStoreState(f)
    try {
      localStorage.setItem("daily-report:stores", JSON.stringify(f))
    } catch {
      // optional
    }
  }
  const [orderCogs, setOrderCogs] = useState<OrderCogsRow[] | null>(null)
  const feeSettings = useFeeSettings()
  const [rates, setRates] = useState<EurRates>(FALLBACK_RATES)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: rev }, { data: sp }, { data: cg }, { data: ref }, { data: ses }] = await Promise.all([
        supabase.from("daily_revenue").select("*").gte("date", from).lte("date", to).limit(20000),
        supabase.from("daily_spend").select("*").gte("date", from).lte("date", to).limit(20000),
        supabase.from("daily_cogs").select("*").gte("date", from).lte("date", to).limit(20000),
        supabase.from("refunds").select("*").gte("date", from).lte("date", to).limit(20000),
        supabase.from("daily_sessions").select("store,sessions,date").gte("date", from).lte("date", to).limit(20000),
      ])
      // Stopped stores (Blinky) only show for days before their stop date
      setRevenue(dropStopped(rev as RevenueRow[]))
      setSpend(dropStopped(sp as SpendRow[]))
      setCogs(dropStopped(cg as CogsRow[]))
      setRefunds(dropStopped(ref as RefundRow[]))
      setSessions(dropStopped(((ses as { store: string; sessions: number; date: string }[]) || [])))
      setRates(await fetchEurRates(from, to))
      // Actual supplier cost of the orders placed in these days (ShipGoods, per order). Longer than
      // 31 days: the saved daily COGS is used instead (ShipGoods would take too long).
      setOrderCogs(null)
      if (nDays <= 31) {
        fetch(`/api/order-cogs?from=${from}&to=${to}`)
          .then((r) => (r.ok ? r.json() : { rows: [] }))
          .then((d) => setOrderCogs(d.rows || []))
          .catch(() => setOrderCogs([]))
      } else setOrderCogs([])
      // Ad performance (clicks, impressions, CTR, CPC) from Windsor, up to the last 92 days
      const adFrom = nDays > 92 ? new Date(Date.parse(to) - 91 * 86400000).toISOString().slice(0, 10) : from
      fetch(`/api/ad-performance?from=${adFrom}&to=${to}`)
        .then((r) => r.ok ? r.json() : { rows: [] })
        .then((d) => setAdPerf(d.rows || []))
        .catch(() => setAdPerf([]))
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  const storeRows = useMemo((): StoreRow[] => {
    const storeNames: string[] = [...STORES.filter((s) => s !== "Overall"), ...stoppedWithData(revenue, spend)]
    return storeNames.map((s) => {
      const rev = revenue.filter((r) => r.store === s)
      const sp = spend.filter((r) => r.store === s)
      const cg = cogs.filter((r) => r.store === s)
      const ref = refunds.filter((r) => r.store === s)

      const totalRevEur = rev.reduce((sum, r) => sum + toEur(r.revenue, STORE_CURRENCY[r.store] || "EUR", r.date, rates), 0)
      const totalOrders = rev.reduce((sum, r) => sum + r.orders, 0)
      const totalSpend = sp.reduce((sum, r) => sum + r.spend, 0)
      const totalRefund = ref.reduce((sum, r) => sum + toEur(Number(r.amount) || 0, STORE_CURRENCY[r.store] || "EUR", r.date, rates), 0)

      // COGS = what ShipGoods prices the orders placed this day at (charged, else its quote).
      // Orders ShipGoods hasn't priced or received yet get the store's average priced order.
      const oc = orderCogs?.find((r) => r.store === s)
      let cogsUsd: number
      let cogsPending = 0
      if (oc && oc.priced + oc.pending > 0) {
        const perOrder = oc.priced + oc.pending > 0 ? oc.cogs_usd / (oc.priced + oc.pending) : AVG_COGS_PER_ORDER[s] || 0
        const notInShipgoods = Math.max(0, totalOrders - oc.priced - oc.pending)
        cogsUsd = oc.cogs_usd + notInShipgoods * perOrder
        cogsPending = oc.pending + notInShipgoods
      } else if (cg.length > 0) {
        cogsUsd = cg.reduce((sum, r) => sum + r.cogs, 0)
      } else {
        cogsUsd = totalOrders * (AVG_COGS_PER_ORDER[s] || 0)
        cogsPending = totalOrders
      }
      const totalCogs = toEur(cogsUsd, COGS_CURRENCY, date, rates)

      // Revenue is gross (order rows only); refunds are subtracted here.
      // Same as the profit sheet: minus transaction fee (% of gross) and media buyer fee (% of ad spend)
      const txnFee = totalRevEur * (TRANSACTION_FEE_RATE[s] ?? 0.035)
      // 0 before its start date (Store Settings), per day so a range can straddle the start date
      const mbFee = sp.reduce((sum, r) => sum + r.spend * mediaBuyerRate(feeSettings, s, r.date), 0)
      const profit = totalRevEur - totalRefund - totalSpend - totalCogs - txnFee - mbFee
      const roas = totalSpend > 0 ? totalRevEur / totalSpend : 0

      // CVR = orders ÷ human sessions (bots excluded), from Shopify Analytics
      const ses = sessions.filter((r) => r.store === s)
      const storeSessions = ses.length ? ses.reduce((sum, r) => sum + r.sessions, 0) : null
      const cvr = storeSessions && storeSessions > 0 ? (totalOrders / storeSessions) * 100 : null

      const spendByChannel: Record<string, number> = {}
      for (const r of sp) {
        const ch = r.channel || "Other"
        spendByChannel[ch] = (spendByChannel[ch] || 0) + r.spend
      }

      return { store: s, revenue: totalRevEur, orders: totalOrders, sessions: storeSessions, cvr, spend: totalSpend, roas, cogs: totalCogs, refunds: Math.round(totalRefund), profit, txnFee, mbFee, cogsPending, spendByChannel }
    }).filter((s) => (s.revenue > 0 || s.spend > 0) && passes(fStore, s.store))
  }, [revenue, spend, cogs, refunds, sessions, rates, date, orderCogs, feeSettings, fStore])

  const totals = useMemo(() => {
    const r = storeRows.reduce((acc, s) => ({
      revenue: acc.revenue + s.revenue,
      orders: acc.orders + s.orders,
      spend: acc.spend + s.spend,
      cogs: acc.cogs + s.cogs,
      refunds: acc.refunds + s.refunds,
      profit: acc.profit + s.profit,
      cogsPending: acc.cogsPending + s.cogsPending,
      txnFee: acc.txnFee + s.txnFee,
      mbFee: acc.mbFee + s.mbFee,
    }), { revenue: 0, orders: 0, spend: 0, cogs: 0, refunds: 0, profit: 0, cogsPending: 0, txnFee: 0, mbFee: 0 })
    // Total CVR only over stores that have session data
    const withSessions = storeRows.filter((s) => s.sessions !== null)
    const totalSessions = withSessions.reduce((a, s) => a + (s.sessions || 0), 0)
    const ordersWithSessions = withSessions.reduce((a, s) => a + s.orders, 0)
    return {
      ...r,
      roas: r.spend > 0 ? r.revenue / r.spend : 0,
      sessions: withSessions.length ? totalSessions : null,
      cvr: totalSessions > 0 ? (ordersWithSessions / totalSessions) * 100 : null,
    }
  }, [storeRows])

  const fmt = (n: number) => `€${Math.round(n).toLocaleString("en-IE")}`
  // Break-even ROAS for the day, same formula as Main Hub: (1 + MB fee %) ÷ (1 − COGS % − transaction fee %).
  // At this ROAS the day's profit is €0 before refunds. null = no revenue that day, so no COGS % to base it on.
  const beRoas = (r: { revenue: number; cogs: number; txnFee: number; mbFee: number; spend: number }): number | null => {
    if (r.revenue <= 0) return null
    const be = breakEvenRoas(r.cogs / r.revenue, r.txnFee / r.revenue, r.spend > 0 ? r.mbFee / r.spend : 0)
    return Number.isFinite(be) ? be : null
  }
  const beCell = (roas: number, be: number | null, spend: number) => {
    if (be === null) return <span style={{ color: "var(--text-dim)" }}>—</span>
    const above = roas >= be
    return (
      <>
        <span style={{ color: "var(--text)" }}>{be.toFixed(2)}x</span>
        {spend > 0 && (
          <span className="block text-[9px] font-normal" style={{ color: above ? "var(--green)" : "var(--red)" }}>
            {above ? "above" : "below"} ({roas >= be ? "+" : ""}{((roas / be - 1) * 100).toFixed(0)}%)
          </span>
        )}
      </>
    )
  }
  const totalBe = beRoas(totals)
  // Profit margin: profit as a share of revenue
  const profitPct = (profit: number, revenue: number) => (revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : "—")
  // ← / → move the whole range by its own length (one day for a single day)
  const shiftDay = (n: number) => {
    const move = (iso: string) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n * nDays); return toInputDate(d) }
    setRange(move(from), move(to))
  }
  const rangeLabel = oneDay ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)} (${nDays} days)`
  const hasData = !loading && storeRows.length > 0
  const adRows = adPerf.filter((r) => passes(fStore, r.store))
  const storeOptions = Array.from(new Set([...STORES.filter((x) => x !== "Overall"), ...revenue.map((r) => r.store), ...spend.map((r) => r.store)]))

  return (
    <PageShell
      title="Daily Report"
      breadcrumb="Home → Daily Report"
      description={`Revenue, ad spend, COGS, refunds and profit per store for ${rangeLabel}. All in EUR.`}
      stats={[
        { label: "Revenue", value: hasData ? fmt(totals.revenue) : "—", color: "var(--green)" },
        { label: "Orders", value: hasData ? String(totals.orders) : "—" },
        { label: "Ad spend", value: hasData ? fmt(totals.spend) : "—" },
        { label: "ROAS", value: hasData ? `${totals.roas.toFixed(2)}x` : "—", sub: hasData && totalBe !== null ? `Break-even ${totalBe.toFixed(2)}x` : undefined, color: hasData && totalBe !== null ? (totals.roas >= totalBe ? "var(--green)" : "var(--red)") : undefined },
        { label: "Profit", value: hasData ? fmt(totals.profit) : "—", sub: hasData ? `${profitPct(totals.profit, totals.revenue)} of revenue` : undefined, color: hasData ? (totals.profit >= 0 ? "var(--green)" : "var(--red)") : undefined },
      ]}
      actions={
        <>
          <Button size="sm" onClick={() => shiftDay(-1)} title={oneDay ? "Previous day" : `Previous ${nDays} days`}>←</Button>
          <DatePicker preset={preset} customFrom={customFrom} customTo={customTo} onChange={(p, f, t) => { setPreset(p); setCustomFrom(f); setCustomTo(t) }} />
          <Button size="sm" onClick={() => shiftDay(1)} title={oneDay ? "Next day" : `Next ${nDays} days`}>→</Button>
          <Button size="sm" onClick={() => setPreset("today")}>Today</Button>
        </>
      }
    >
      <FixBanner />

      <FilterBar right={fStore.values.length ? <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{fStore.mode === "include" ? "Only" : "Without"} {fStore.values.join(", ")}</span> : undefined}>
        <FilterSelect label="Store" options={storeOptions} value={fStore} onChange={setFStore} />
      </FilterBar>

      {/* Store timezone clocks */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STORES.filter(s => s !== "Overall" && passes(fStore, s)).map((s) => {
          const tz = STORE_TIMEZONE[s] || "UTC"
          const market = STORE_MARKET[s] || ""
          const localDate = getLocalDate(tz)
          const localTime = getLocalTime(tz)
          const isSelectedDate = localDate >= from && localDate <= to
          const isFuture = from > localDate
          return (
            <div
              key={s}
              className="glass flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px]"
            >
              <span className="font-medium" style={{ color: "var(--text-muted)" }}>{s}</span>
              <span style={{ color: "var(--text-dim)" }}>{market}</span>
              <span className="font-mono tabular-nums" style={{ color: "var(--text)" }} suppressHydrationWarning>{localTime}</span>
              {isFuture && <Badge tone="amber">Still {localDate.slice(5)}</Badge>}
              {isSelectedDate && <Badge tone="green">{oneDay ? "Today" : "Incl. today"}</Badge>}
            </div>
          )
        })}
      </div>

      {loading ? (
        <Loading>Loading the daily report…</Loading>
      ) : (
        <div className="space-y-4">
          {storeRows.length === 0 ? (
            <EmptyState title={`No data for ${rangeLabel}`}>Data may not have been imported for this date yet. The daily refresh runs around 07:00 Amsterdam time.</EmptyState>
          ) : (
            <Panel pad={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", color: "var(--text-dim)" }}>
                      <th className={`${TH} text-left`}>Store</th>
                      <th className={`${TH} text-left`}>Market</th>
                      <th className={`${TH} text-right`}>Revenue</th>
                      <th className={`${TH} text-right`}>Orders</th>
                      <th className={`${TH} text-right`} title="Orders ÷ human sessions (bots excluded)">CVR</th>
                      <th className={`${TH} text-right`}>ROAS</th>
                      <th className={`${TH} text-right`} title="Break-even ROAS for this day: (1 + media buyer fee %) ÷ (1 − COGS % − transaction fee %). Below it you lose money on the day (before refunds).">BE ROAS</th>
                      <th className={`${TH} text-right`}>Ad spend</th>
                      <th className={`${TH} text-right`}>COGS</th>
                      <th className={`${TH} text-right`}>COGS %</th>
                      <th className={`${TH} text-right`}>Refunds</th>
                      <th className={`${TH} text-right`} title="Transaction fee (% of revenue) + media buyer fee (% of ad spend, from its start date in Store Settings)">Fees</th>
                      <th className={`${TH} text-right`} title="Revenue − refunds − ad spend − COGS − transaction fee − media buyer fee">Profit</th>
                      <th className={`${TH} text-right`} title="Profit ÷ revenue">Profit %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeRows.map((s) => {
                      const tz = STORE_TIMEZONE[s.store] || "UTC"
                      const localDate = getLocalDate(tz)
                      const isFuture = from > localDate
                      return (
                        <tr key={s.store} style={{ ...ROW_BORDER, opacity: isFuture ? 0.5 : 1 }}>
                          <td className={`${TD} font-medium`} style={{ color: "var(--text)" }}>{s.store}</td>
                          <td className={`${TD} text-[10px]`} style={{ color: "var(--text-dim)" }}>
                            {STORE_MARKET[s.store] || ""}
                            {isFuture && <span className="ml-1 text-[9px]" style={{ color: "var(--orange)" }} title="This day isn't over yet in this store's timezone">(day not over)</span>}
                          </td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--green)" }}>{fmt(s.revenue)}</td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{s.orders}</td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }} title={s.sessions !== null ? `${s.orders} orders ÷ ${s.sessions.toLocaleString("en-IE")} human sessions` : "No session data for this day yet"}>
                            {s.cvr !== null ? `${s.cvr.toFixed(2)}%` : "—"}
                            {s.sessions !== null && <span className="block text-[9px]" style={{ color: "var(--text-dim)" }}>{s.sessions.toLocaleString("en-IE")} sess.</span>}
                          </td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: s.roas >= 2.5 ? "var(--green)" : s.roas >= 1.5 ? "var(--orange)" : "var(--red)" }}>{s.roas.toFixed(2)}x</td>
                          <td className={`${TD} text-right tabular-nums`}>{beCell(s.roas, beRoas(s), s.spend)}</td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>
                            {fmt(s.spend)}
                            {Object.keys(s.spendByChannel).length > 1 && (
                              <span className="block text-[9px]" style={{ color: "var(--text-dim)" }}>
                                {Object.entries(s.spendByChannel).sort(([,a],[,b]) => b - a).map(([ch, v]) => `${ch} ${fmt(v)}`).join(" · ")}
                              </span>
                            )}
                          </td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }} title={s.cogsPending ? `${s.cogsPending} order(s) not priced by ShipGoods yet: store average used` : "ShipGoods price of these orders"}>{fmt(s.cogs)}{s.cogsPending > 0 && <span style={{ color: "var(--amber)" }}>*</span>}</td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: s.revenue > 0 ? (s.cogs / s.revenue * 100 > 35 ? "var(--red)" : s.cogs / s.revenue * 100 > 25 ? "var(--orange)" : "var(--text-muted)") : "var(--text-dim)" }}>{s.revenue > 0 ? `${(s.cogs / s.revenue * 100).toFixed(1)}%` : "—"}</td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: s.refunds > 0 ? "var(--red)" : "var(--text-dim)" }}>{fmt(s.refunds)}</td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }} title={`Transaction fee ${fmt(s.txnFee)}${s.mbFee > 0 ? ` + media buyer fee ${fmt(s.mbFee)}` : " · no media buyer fee"}`}>
                            {fmt(s.txnFee + s.mbFee)}
                            {s.mbFee > 0 && <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>txn {fmt(s.txnFee)} · MB {fmt(s.mbFee)}</div>}
                          </td>
                          <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: s.profit >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(s.profit)}</td>
                          <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: s.profit >= 0 ? "var(--green)" : "var(--red)" }}>{profitPct(s.profit, s.revenue)}</td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)" }}>
                      <td className={`${TD} font-bold`} style={{ color: "var(--text)" }}>Total</td>
                      <td className={TD}></td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: "var(--green)" }}>{fmt(totals.revenue)}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: "var(--text)" }}>{totals.orders}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: "var(--text)" }}>
                        {totals.cvr !== null ? `${totals.cvr.toFixed(2)}%` : "—"}
                        {totals.sessions !== null && <span className="block text-[9px] font-normal" style={{ color: "var(--text-dim)" }}>{totals.sessions.toLocaleString("en-IE")} sess.</span>}
                      </td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: totals.roas >= 2.5 ? "var(--green)" : totals.roas >= 1.5 ? "var(--orange)" : "var(--red)" }}>{totals.roas.toFixed(2)}x</td>
                      <td className={`${TD} text-right tabular-nums font-bold`}>{beCell(totals.roas, totalBe, totals.spend)}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: "var(--text-muted)" }}>{fmt(totals.spend)}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: "var(--text-muted)" }}>{fmt(totals.cogs)}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: totals.revenue > 0 ? (totals.cogs / totals.revenue * 100 > 35 ? "var(--red)" : totals.cogs / totals.revenue * 100 > 25 ? "var(--orange)" : "var(--text-muted)") : "var(--text-dim)" }}>{totals.revenue > 0 ? `${(totals.cogs / totals.revenue * 100).toFixed(1)}%` : "—"}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: totals.refunds > 0 ? "var(--red)" : "var(--text-dim)" }}>{fmt(totals.refunds)}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: "var(--text-muted)" }}>
                        {fmt(totals.txnFee + totals.mbFee)}
                        {totals.mbFee > 0 && <div className="text-[9px] font-normal" style={{ color: "var(--text-dim)" }}>txn {fmt(totals.txnFee)} · MB {fmt(totals.mbFee)}</div>}
                      </td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: totals.profit >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(totals.profit)}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: totals.profit >= 0 ? "var(--green)" : "var(--red)" }}>{profitPct(totals.profit, totals.revenue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 text-[9px]" style={{ color: "var(--text-dim)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                All amounts in EUR · Revenue converted at ECB daily rate{rates.fallback ? " (fallback rates)" : ""} · Times shown in each store&apos;s market timezone · Profit = revenue − refunds − ad spend − COGS ({nDays <= 31 ? "ShipGoods price of the orders placed in these days" : "saved daily COGS; ranges over 31 days don't read ShipGoods per order"}) − transaction fee − media buyer fee (from its start date in Store Settings) · BE ROAS = break-even ROAS of the period from its COGS % and fees{orderCogs == null ? " · Loading ShipGoods costs…" : totals.cogsPending > 0 ? ` · * ${totals.cogsPending} order(s) not priced by ShipGoods yet, store average used` : ""}
              </div>
            </Panel>
          )}

          {/* Ad Performance breakdown */}
          {adRows.length > 0 && (
            <Panel title="Ad Performance" pad={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", color: "var(--text-dim)" }}>
                      <th className={`${TH} text-left`}>Store</th>
                      <th className={`${TH} text-left`}>Platform</th>
                      <th className={`${TH} text-right`}>Spend</th>
                      <th className={`${TH} text-right`}>Clicks</th>
                      <th className={`${TH} text-right`}>Impressions</th>
                      <th className={`${TH} text-right`}>CTR</th>
                      <th className={`${TH} text-right`}>CPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adRows
                      .sort((a, b) => b.spend - a.spend)
                      .map((r) => (
                        <tr key={`${r.store}|${r.channel}`} style={ROW_BORDER} className="hover:bg-white/[0.02] transition-colors">
                          <td className={`${TD} font-medium`} style={{ color: "var(--text)" }}>{r.store}</td>
                          <td className={TD}>
                            <Badge tone={r.channel === "Google" ? "blue" : r.channel === "Meta" ? "accent" : "amber"}>
                              {r.channel}
                            </Badge>
                          </td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{fmt(r.spend)}</td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{r.clicks.toLocaleString("en-IE")}</td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{r.impressions.toLocaleString("en-IE")}</td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: r.ctr >= 2 ? "var(--green)" : r.ctr >= 1 ? "var(--text)" : "var(--orange)" }}>
                            {r.ctr.toFixed(2)}%
                          </td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: r.cpc <= 0.5 ? "var(--green)" : r.cpc <= 1 ? "var(--text)" : "var(--red)" }}>
                            €{r.cpc.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    {/* Totals row */}
                    {(() => {
                      const totalSpend = adRows.reduce((s, r) => s + r.spend, 0)
                      const totalClicks = adRows.reduce((s, r) => s + r.clicks, 0)
                      const totalImpressions = adRows.reduce((s, r) => s + r.impressions, 0)
                      const totalCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
                      const totalCpc = totalClicks > 0 ? totalSpend / totalClicks : 0
                      return (
                        <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)" }}>
                          <td className={`${TD} font-bold`} style={{ color: "var(--text)" }}>Total</td>
                          <td className={TD}></td>
                          <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: "var(--text-muted)" }}>{fmt(totalSpend)}</td>
                          <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: "var(--text)" }}>{totalClicks.toLocaleString("en-IE")}</td>
                          <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: "var(--text)" }}>{totalImpressions.toLocaleString("en-IE")}</td>
                          <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: totalCtr >= 2 ? "var(--green)" : totalCtr >= 1 ? "var(--text)" : "var(--orange)" }}>
                            {totalCtr.toFixed(2)}%
                          </td>
                          <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: totalCpc <= 0.5 ? "var(--green)" : totalCpc <= 1 ? "var(--text)" : "var(--red)" }}>
                            €{totalCpc.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })()}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 text-[9px]" style={{ color: "var(--text-dim)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                Clicks, impressions, CTR and CPC from Windsor.ai, per ad account day (NL; Meta LUMEGLASSES: Los Angeles), so spend here can differ a little from the store-day spend above · All ad spend in EUR · Data cached for 5 min{nDays > 92 ? " · Ad performance shows the last 92 days of this range" : ""}
              </div>
            </Panel>
          )}

          <Panel title="Notes">
            <textarea
              className="w-full bg-transparent border rounded-lg p-3 text-[11px] resize-none"
              style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)", minHeight: 80 }}
              placeholder="Daily notes: what happened today, what to check tomorrow…"
            />
          </Panel>
        </div>
      )}
    </PageShell>
  )
}
