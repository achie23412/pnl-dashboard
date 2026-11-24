"use client"
import { useEffect, useState, useMemo } from "react"
import { createClient } from "@supabase/supabase-js"
import { STORES, AVG_COGS_PER_ORDER, TRANSACTION_FEE_RATE, STORE_TIMEZONE, STORE_MARKET } from "@/lib/constants"
import { STORE_CURRENCY, COGS_CURRENCY, fetchEurRates, toEur, FALLBACK_RATES } from "@/lib/currency"
import type { EurRates } from "@/lib/currency"
import type { RevenueRow, SpendRow, CogsRow, RefundRow } from "@/lib/types"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

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
  spend: number
  roas: number
  cogs: number
  refunds: number
  profit: number
}

export default function DailyReportPage() {
  const [date, setDate] = useState(toInputDate(new Date()))
  const [revenue, setRevenue] = useState<RevenueRow[]>([])
  const [spend, setSpend] = useState<SpendRow[]>([])
  const [cogs, setCogs] = useState<CogsRow[]>([])
  const [refunds, setRefunds] = useState<RefundRow[]>([])
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
      const [{ data: rev }, { data: sp }, { data: cg }, { data: ref }] = await Promise.all([
        supabase.from("daily_revenue").select("*").eq("date", date),
        supabase.from("daily_spend").select("*").eq("date", date),
        supabase.from("daily_cogs").select("*").eq("date", date),
        supabase.from("refunds").select("*").eq("date", date),
      ])
      setRevenue((rev as RevenueRow[]) || [])
      setSpend((sp as SpendRow[]) || [])
      setCogs((cg as CogsRow[]) || [])
      setRefunds((ref as RefundRow[]) || [])
      setRates(await fetchEurRates(date, date))
      setLoading(false)
    }
    load()
  }, [date])

  const storeRows = useMemo((): StoreRow[] => {
    const storeNames = STORES.filter((s) => s !== "Overall")
    return storeNames.map((s) => {
      const rev = revenue.filter((r) => r.store === s)
      const sp = spend.filter((r) => r.store === s)
      const cg = cogs.filter((r) => r.store === s)
      const ref = refunds.filter((r) => r.store === s)

      const totalRevEur = rev.reduce((sum, r) => sum + toEur(r.revenue, STORE_CURRENCY[r.store] || "EUR", r.date, rates), 0)
      const totalOrders = rev.reduce((sum, r) => sum + r.orders, 0)
      const totalSpend = sp.reduce((sum, r) => sum + r.spend, 0)
      const totalRefund = ref.reduce((sum, r) => sum + r.amount, 0)

      const actualCogs = cg.reduce((sum, r) => sum + toEur(r.cogs, COGS_CURRENCY, r.date, rates), 0)
      const hasCogs = cg.length > 0
      const estCogs = hasCogs ? 0 : totalOrders * toEur(AVG_COGS_PER_ORDER[s] || 0, COGS_CURRENCY, date, rates)
      const totalCogs = actualCogs + estCogs

      const profit = totalRevEur - totalSpend - totalCogs
      const roas = totalSpend > 0 ? totalRevEur / totalSpend : 0

      return { store: s, revenue: totalRevEur, orders: totalOrders, spend: totalSpend, roas, cogs: totalCogs, refunds: Math.round(totalRefund), profit }
    }).filter((s) => s.revenue > 0 || s.spend > 0)
  }, [revenue, spend, cogs, refunds, rates, date])

  const totals = useMemo(() => {
    const r = storeRows.reduce((acc, s) => ({
      revenue: acc.revenue + s.revenue,
      orders: acc.orders + s.orders,
      spend: acc.spend + s.spend,
      cogs: acc.cogs + s.cogs,
      refunds: acc.refunds + s.refunds,
      profit: acc.profit + s.profit,
    }), { revenue: 0, orders: 0, spend: 0, cogs: 0, refunds: 0, profit: 0 })
    return { ...r, roas: r.spend > 0 ? r.revenue / r.spend : 0 }
  }, [storeRows])

  const fmt = (n: number) => `€${Math.round(n).toLocaleString("en-IE")}`

  return (
    <div className="p-6 min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>Home → Daily Report</div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--text)" }}>Daily Report</h1>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() - 1); setDate(toInputDate(d)) }}
          className="px-2 py-1 rounded-lg text-[11px] font-medium"
          style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.08)" }}
        >←</button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text)", colorScheme: "dark" }}
        />
        <button
          onClick={() => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + 1); setDate(toInputDate(d)) }}
          className="px-2 py-1 rounded-lg text-[11px] font-medium"
          style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.08)" }}
        >→</button>
        <button
          onClick={() => setDate(toInputDate(new Date()))}
          className="px-2.5 py-1 rounded-lg text-[10px] font-medium"
          style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)" }}
        >Today</button>
        <div className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
          {formatDate(date)}
        </div>
      </div>

      {/* Store timezone clocks */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STORES.filter(s => s !== "Overall").map((s) => {
          const tz = STORE_TIMEZONE[s] || "UTC"
          const market = STORE_MARKET[s] || ""
          const localDate = getLocalDate(tz)
          const localTime = getLocalTime(tz)
          const isSelectedDate = localDate === date
          const isFuture = date > localDate
          return (
            <div
              key={s}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="font-medium" style={{ color: "var(--text-muted)" }}>{s}</span>
              <span style={{ color: "var(--text-dim)" }}>{market}</span>
              <span className="font-mono" style={{ color: "var(--text)" }}>{localTime}</span>
              {isFuture && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: "rgba(249,115,22,0.15)", color: "#f97316" }}>
                  still {localDate.slice(5)}
                </span>
              )}
              {isSelectedDate && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                  today
                </span>
              )}
            </div>
          )
        })}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 rounded-full animate-spin" style={{ border: "2px solid rgba(255,255,255,0.06)", borderTopColor: "var(--accent)" }} />
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Loading</span>
        </div>
      ) : (
        <div className="space-y-4">
          {storeRows.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <div className="text-[13px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>No data for {formatDate(date)}</div>
              <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Data may not have been imported for this date yet.</div>
            </div>
          ) : (
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Store</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-[9px]" style={{ color: "var(--text-dim)" }}>Market</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Revenue</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Orders</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>ROAS</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Ad Spend</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>COGS</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Refunds</th>
                    <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Est. Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {storeRows.map((s) => {
                    const tz = STORE_TIMEZONE[s.store] || "UTC"
                    const localDate = getLocalDate(tz)
                    const isFuture = date > localDate
                    return (
                      <tr key={s.store} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", opacity: isFuture ? 0.5 : 1 }}>
                        <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{s.store}</td>
                        <td className="px-3 py-2 text-[9px]" style={{ color: "var(--text-dim)" }}>
                          {STORE_MARKET[s.store] || ""}
                          {isFuture && <span className="ml-1 text-[8px]" style={{ color: "#f97316" }}>⏳</span>}
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: "var(--green)" }}>{fmt(s.revenue)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: "var(--text)" }}>{s.orders}</td>
                        <td className="px-3 py-2 text-right" style={{ color: s.roas >= 2.5 ? "var(--green)" : s.roas >= 1.5 ? "var(--orange)" : "var(--red)" }}>{s.roas.toFixed(2)}x</td>
                        <td className="px-3 py-2 text-right" style={{ color: "var(--text-muted)" }}>{fmt(s.spend)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: "var(--text-muted)" }}>{fmt(s.cogs)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: s.refunds > 0 ? "var(--red)" : "var(--text-dim)" }}>{fmt(s.refunds)}</td>
                        <td className="px-3 py-2 text-right font-medium" style={{ color: s.profit >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(s.profit)}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)" }}>
                    <td className="px-3 py-2 font-bold" style={{ color: "var(--text)" }}>Total</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: "var(--green)" }}>{fmt(totals.revenue)}</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: "var(--text)" }}>{totals.orders}</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: totals.roas >= 2.5 ? "var(--green)" : totals.roas >= 1.5 ? "var(--orange)" : "var(--red)" }}>{totals.roas.toFixed(2)}x</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: "var(--text-muted)" }}>{fmt(totals.spend)}</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: "var(--text-muted)" }}>{fmt(totals.cogs)}</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: totals.refunds > 0 ? "var(--red)" : "var(--text-dim)" }}>{fmt(totals.refunds)}</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: totals.profit >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(totals.profit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="text-[9px] text-center py-1" style={{ color: "var(--text-dim)" }}>
            All amounts in EUR · Revenue converted at ECB daily rate{rates.fallback ? " (fallback rates)" : ""} · Times shown in each store's market timezone
          </div>

          <div className="glass rounded-xl p-4">
            <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--text-muted)" }}>Notes</div>
            <textarea
              className="w-full bg-transparent border rounded-lg p-3 text-[11px] resize-none"
              style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)", minHeight: 80 }}
              placeholder="Daily notes — what happened today, what to check tomorrow..."
            />
          </div>
        </div>
      )}
    </div>
  )
}
