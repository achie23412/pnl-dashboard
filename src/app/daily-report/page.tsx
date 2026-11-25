"use client"
import { useEffect, useState, useMemo } from "react"
import { db } from "@/lib/db-client"
import { STORES, AVG_COGS_PER_ORDER, TRANSACTION_FEE_RATE, MEDIA_BUYER_FEE_RATE, STORE_TIMEZONE, STORE_MARKET } from "@/lib/constants"
import { STORE_CURRENCY, COGS_CURRENCY, fetchEurRates, toEur, FALLBACK_RATES } from "@/lib/currency"
import type { EurRates } from "@/lib/currency"
import type { RevenueRow, SpendRow, CogsRow, RefundRow } from "@/lib/types"
import { FixBanner } from "@/components/FixBanner"
import { PageShell } from "@/components/PageShell"
import { SingleDatePicker } from "@/components/SingleDatePicker"
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
  spendByChannel: Record<string, number>
}

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
  const [date, setDate] = useState(toInputDate(new Date()))
  const [revenue, setRevenue] = useState<RevenueRow[]>([])
  const [spend, setSpend] = useState<SpendRow[]>([])
  const [cogs, setCogs] = useState<CogsRow[]>([])
  const [refunds, setRefunds] = useState<RefundRow[]>([])
  const [sessions, setSessions] = useState<{ store: string; sessions: number }[]>([])
  const [adPerf, setAdPerf] = useState<AdPerfRow[]>([])
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
        supabase.from("daily_revenue").select("*").eq("date", date),
        supabase.from("daily_spend").select("*").eq("date", date),
        supabase.from("daily_cogs").select("*").eq("date", date),
        supabase.from("refunds").select("*").eq("date", date),
        supabase.from("daily_sessions").select("store,sessions").eq("date", date),
      ])
      setRevenue((rev as RevenueRow[]) || [])
      setSpend((sp as SpendRow[]) || [])
      setCogs((cg as CogsRow[]) || [])
      setRefunds((ref as RefundRow[]) || [])
      setSessions((ses as { store: string; sessions: number }[]) || [])
      setRates(await fetchEurRates(date, date))
      // Fetch ad performance (clicks, impressions, CTR, CPC) from Windsor
      fetch(`/api/ad-performance?date=${date}`)
        .then((r) => r.ok ? r.json() : { rows: [] })
        .then((d) => setAdPerf(d.rows || []))
        .catch(() => setAdPerf([]))
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
      const totalRefund = ref.reduce((sum, r) => sum + toEur(Number(r.amount) || 0, STORE_CURRENCY[r.store] || "EUR", r.date, rates), 0)

      const actualCogs = cg.reduce((sum, r) => sum + toEur(r.cogs, COGS_CURRENCY, r.date, rates), 0)
      const hasCogs = cg.length > 0
      const estCogs = hasCogs ? 0 : totalOrders * toEur(AVG_COGS_PER_ORDER[s] || 0, COGS_CURRENCY, date, rates)
      const totalCogs = actualCogs + estCogs

      // Revenue is gross (order rows only); refunds are subtracted here.
      // Same as the profit sheet: minus transaction fee (% of gross) and media buyer fee (% of ad spend)
      const fees = totalRevEur * (TRANSACTION_FEE_RATE[s] ?? 0.035) + totalSpend * (MEDIA_BUYER_FEE_RATE[s] ?? 0)
      const profit = totalRevEur - totalRefund - totalSpend - totalCogs - fees
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

      return { store: s, revenue: totalRevEur, orders: totalOrders, sessions: storeSessions, cvr, spend: totalSpend, roas, cogs: totalCogs, refunds: Math.round(totalRefund), profit, spendByChannel }
    }).filter((s) => s.revenue > 0 || s.spend > 0)
  }, [revenue, spend, cogs, refunds, sessions, rates, date])

  const totals = useMemo(() => {
    const r = storeRows.reduce((acc, s) => ({
      revenue: acc.revenue + s.revenue,
      orders: acc.orders + s.orders,
      spend: acc.spend + s.spend,
      cogs: acc.cogs + s.cogs,
      refunds: acc.refunds + s.refunds,
      profit: acc.profit + s.profit,
    }), { revenue: 0, orders: 0, spend: 0, cogs: 0, refunds: 0, profit: 0 })
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
  // Profit margin: est. profit as a share of revenue
  const profitPct = (profit: number, revenue: number) => (revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : "—")
  const shiftDay = (n: number) => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + n); setDate(toInputDate(d)) }
  const hasData = !loading && storeRows.length > 0

  return (
    <PageShell
      title="Daily Report"
      breadcrumb="Home → Daily Report"
      description={`Revenue, ad spend, COGS, refunds and estimated profit per store for ${formatDate(date)}. All in EUR.`}
      stats={[
        { label: "Revenue", value: hasData ? fmt(totals.revenue) : "—", color: "var(--green)" },
        { label: "Orders", value: hasData ? String(totals.orders) : "—" },
        { label: "Ad spend", value: hasData ? fmt(totals.spend) : "—" },
        { label: "ROAS", value: hasData ? `${totals.roas.toFixed(2)}x` : "—" },
        { label: "Est. profit", value: hasData ? fmt(totals.profit) : "—", sub: hasData ? `${profitPct(totals.profit, totals.revenue)} of revenue` : undefined, color: hasData ? (totals.profit >= 0 ? "var(--green)" : "var(--red)") : undefined },
      ]}
      actions={
        <>
          <Button size="sm" onClick={() => shiftDay(-1)} title="Previous day">←</Button>
          <SingleDatePicker value={date} onChange={(v) => v && setDate(v)} allowEmpty={false} />
          <Button size="sm" onClick={() => shiftDay(1)} title="Next day">→</Button>
          <Button size="sm" onClick={() => setDate(toInputDate(new Date()))}>Today</Button>
        </>
      }
    >
      <FixBanner />

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
              className="glass flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px]"
            >
              <span className="font-medium" style={{ color: "var(--text-muted)" }}>{s}</span>
              <span style={{ color: "var(--text-dim)" }}>{market}</span>
              <span className="font-mono tabular-nums" style={{ color: "var(--text)" }}>{localTime}</span>
              {isFuture && <Badge tone="amber">Still {localDate.slice(5)}</Badge>}
              {isSelectedDate && <Badge tone="green">Today</Badge>}
            </div>
          )
        })}
      </div>

      {loading ? (
        <Loading>Loading the daily report…</Loading>
      ) : (
        <div className="space-y-4">
          {storeRows.length === 0 ? (
            <EmptyState title={`No data for ${formatDate(date)}`}>Data may not have been imported for this date yet. The daily refresh runs around 07:00 Amsterdam time.</EmptyState>
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
                      <th className={`${TH} text-right`}>Ad spend</th>
                      <th className={`${TH} text-right`}>COGS</th>
                      <th className={`${TH} text-right`}>Refunds</th>
                      <th className={`${TH} text-right`}>Est. profit</th>
                      <th className={`${TH} text-right`} title="Est. profit ÷ revenue">Profit %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeRows.map((s) => {
                      const tz = STORE_TIMEZONE[s.store] || "UTC"
                      const localDate = getLocalDate(tz)
                      const isFuture = date > localDate
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
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>
                            {fmt(s.spend)}
                            {Object.keys(s.spendByChannel).length > 1 && (
                              <span className="block text-[9px]" style={{ color: "var(--text-dim)" }}>
                                {Object.entries(s.spendByChannel).sort(([,a],[,b]) => b - a).map(([ch, v]) => `${ch} ${fmt(v)}`).join(" · ")}
                              </span>
                            )}
                          </td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{fmt(s.cogs)}</td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: s.refunds > 0 ? "var(--red)" : "var(--text-dim)" }}>{fmt(s.refunds)}</td>
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
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: "var(--text-muted)" }}>{fmt(totals.spend)}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: "var(--text-muted)" }}>{fmt(totals.cogs)}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: totals.refunds > 0 ? "var(--red)" : "var(--text-dim)" }}>{fmt(totals.refunds)}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: totals.profit >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(totals.profit)}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`} style={{ color: totals.profit >= 0 ? "var(--green)" : "var(--red)" }}>{profitPct(totals.profit, totals.revenue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 text-[9px]" style={{ color: "var(--text-dim)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                All amounts in EUR · Revenue converted at ECB daily rate{rates.fallback ? " (fallback rates)" : ""} · Times shown in each store&apos;s market timezone
              </div>
            </Panel>
          )}

          {/* Ad Performance breakdown */}
          {adPerf.length > 0 && (
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
                    {adPerf
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
                      const totalSpend = adPerf.reduce((s, r) => s + r.spend, 0)
                      const totalClicks = adPerf.reduce((s, r) => s + r.clicks, 0)
                      const totalImpressions = adPerf.reduce((s, r) => s + r.impressions, 0)
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
                Clicks, impressions, CTR and CPC from Windsor.ai · All ad spend in EUR · Data cached for 5 min
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
