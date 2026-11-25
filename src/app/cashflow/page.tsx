"use client"
import { useEffect, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { Panel, Notice, Loading, Button, TH, TD, ROW_BORDER } from "@/components/ui"
import { STORE_COLORS } from "@/lib/constants"
import type { CashflowData } from "@/lib/cashflow"

const eur = (n: number | null | undefined) =>
  n == null ? "—" : `${n < 0 ? "−" : ""}€${Math.abs(n).toLocaleString("en-IE", { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 })}`
const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })

function processorStatus(name: string, data: CashflowData): { connected: boolean; how: string } {
  if (name === "Shopify Payments") return { connected: true, how: "Connected via Windsor (payouts, pending balance, fees)." }
  if (name === "Whop") {
    if (data.whop_balance?.available) return { connected: true, how: `Balance $${data.whop_balance.balance_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} · pending $${data.whop_balance.pending_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` }
    return { connected: false, how: "Add WHOP_API_KEY in Vercel (Whop → Developer → API keys)." }
  }
  if (name === "PayPal") return { connected: false, how: "Add PayPal connector in Windsor to see balance and fees." }
  if (name === "Whale Checkout") return { connected: false, how: "No API — enter balance manually or export from Whale dashboard." }
  return { connected: false, how: "Unknown gateway." }
}

const CACHE_KEY = "cashflow:v1"

export default function CashflowPage() {
  const [data, setData] = useState<CashflowData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [allDays, setAllDays] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        setData(JSON.parse(raw))
        setLoading(false)
      }
    } catch {
      // ignore
    }
    fetch("/api/cashflow")
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        setData(j)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(j))
        } catch {
          // optional
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const t = data?.totals
  const days = data ? (allDays ? data.days : data.days.slice(0, 7)) : []

  return (
    <PageShell
      title="Cashflow & Balance"
      breadcrumb="Finance → Cashflow & Balance"
      description="Money coming in per payment processor, money going out (ads, COGS, refunds, fees) and what's still waiting in Shopify Payments. All in EUR."
      stats={[
        { label: "Shopify Payments balance", value: t ? eur(t.balance_known) : "—" },
        { label: "Incoming (7d)", value: t ? eur(t.incoming_7d) : "—" },
        { label: "Outgoing (7d)", value: t ? eur(t.outgoing_7d) : "—" },
        { label: "Net flow (7d)", value: t ? eur(t.net_7d) : "—" },
      ]}
    >
      {error && <Notice tone="error">Couldn&apos;t load cashflow: {error}.</Notice>}
      {loading && !data && <Loading>Loading payouts and balances…</Loading>}

      {data && t && (
        <div className="space-y-4">
          {/* Shopify Payments per store */}
          <Panel title="Shopify Payments per store" pad={false}>
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ color: "var(--text-dim)" }}>
                  <th className={`${TH} text-left`}>Store</th>
                  <th className={`${TH} text-right`}>Pending</th>
                  <th className={`${TH} text-right`}>In transit</th>
                  <th className={`${TH} text-right`}>Paid out (30d)</th>
                  <th className={`${TH} text-right`}>Fees (30d)</th>
                  <th className={`${TH} text-right`}>Last payout</th>
                </tr>
              </thead>
              <tbody>
                {data.stores.map((s) => (
                  <tr key={s.store} style={ROW_BORDER}>
                    <td className={TD}>
                      <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: "var(--text)" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: STORE_COLORS[s.store] || "#666" }} />
                        {s.store}
                      </span>
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--orange)" }}>{eur(s.pending)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{eur(s.in_transit)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--green)" }}>{eur(s.paid_out_30d)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{eur(s.fees_30d)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>
                      {s.last_payout ? `${eur(s.last_payout.amount)} · ${fmtDay(s.last_payout.date)}` : "none in 30 days"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {/* Whop balance */}
          {data.whop_balance?.available && (
            <div className="glass rounded-xl p-4">
              <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--text)" }}>Whop balance (USD)</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Available", value: `$${data.whop_balance.balance_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, color: "var(--green)" },
                  { label: "Pending", value: `$${data.whop_balance.pending_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, color: "var(--orange)" },
                  { label: "Total income", value: `$${data.whop_balance.income_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "var(--text)" },
                  { label: "Withdrawn", value: `$${data.whop_balance.withdrawn_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "var(--text-muted)" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-dim)" }}>{s.label}</div>
                    <div className="text-[14px] font-semibold tabular-nums" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {data.whop_balance.recent_payouts.length > 0 && (
                <div className="mt-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Recent payouts</div>
                  <div className="space-y-0.5">
                    {data.whop_balance.recent_payouts.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-[10px]">
                        <span style={{ color: "var(--text-muted)" }}>{p.date ? fmtDay(p.date) : "—"}</span>
                        <span className="tabular-nums" style={{ color: p.status === "completed" ? "var(--green)" : "var(--orange)" }}>
                          ${p.amount_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} {p.status !== "completed" ? `(${p.status})` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Processors */}
          <Panel title="Money in per payment processor" pad={false}>
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ color: "var(--text-dim)" }}>
                  <th className={`${TH} text-left`}>Processor</th>
                  <th className={`${TH} text-right`}>Incoming (7d)</th>
                  <th className={`${TH} text-right`}>Incoming (30d)</th>
                  <th className={`${TH} text-right`}>Share (30d)</th>
                  <th className={`${TH} text-left`}>Stores</th>
                  <th className={`${TH} text-left`}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.processors.map((p) => {
                  const st = processorStatus(p.processor, data)
                  const share = t.incoming_30d > 0 ? (p.incoming_30d / t.incoming_30d) * 100 : 0
                  return (
                    <tr key={p.processor} style={ROW_BORDER}>
                      <td className={`${TD} font-medium`} style={{ color: "var(--text)" }}>{p.processor}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{eur(p.incoming_7d)}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{eur(p.incoming_30d)}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{share.toFixed(1)}%</td>
                      <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{p.stores.join(", ")}</td>
                      <td className={`${TD} text-[10px] max-w-[320px]`} style={{ color: st.connected ? "var(--green)" : "var(--orange)" }}>{st.how}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Panel>

          {/* Daily flow */}
          <Panel
            title="Daily cash flow"
            pad={false}
            right={<span className="text-[10px]" style={{ color: "var(--text-dim)" }}>30 days: in {eur(t.incoming_30d)} · out {eur(t.outgoing_30d)} · net {eur(t.net_30d)}</span>}
          >
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ color: "var(--text-dim)" }}>
                  {["Date", "Incoming", "Ad spend", "COGS", "Refunds", "Fees", "Net"].map((h, i) => (
                    <th key={h} className={`${TH} ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date} style={ROW_BORDER}>
                    <td className={TD} style={{ color: "var(--text)" }}>{fmtDay(d.date)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--green)" }}>{eur(d.incoming)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{eur(d.ad_spend)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{eur(d.cogs)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{eur(d.refunds)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{eur(d.fees)}</td>
                    <td className={`${TD} text-right tabular-nums font-semibold`} style={{ color: d.net >= 0 ? "var(--green)" : "var(--red)" }}>{eur(d.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.days.length > 7 && (
              <div className="flex justify-center py-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <Button variant="ghost" size="sm" onClick={() => setAllDays((x) => !x)}>
                  {allDays ? "Show last 7 days only" : `Show ${data.days.length - 7} more days`}
                </Button>
              </div>
            )}
          </Panel>

          {/* Payouts */}
          <Panel title="Recent Shopify Payments payouts">
            {data.payouts.length === 0 ? (
              <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>No payouts in the last 30 days.</div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                {data.payouts.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px]">
                    <span style={{ color: "var(--text-muted)" }}>{fmtDay(p.date)} · {p.store}</span>
                    <span className="tabular-nums" style={{ color: p.status === "PAID" ? "var(--green)" : "var(--orange)" }}>
                      {p.currency === "EUR" ? "€" : p.currency + " "}{p.amount.toLocaleString("en-IE")} {p.status !== "PAID" ? `(${p.status.toLowerCase()})` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="text-[9px] space-y-0.5" style={{ color: "var(--text-dim)" }}>
            {data.notes.map((n) => <div key={n}>• {n}</div>)}
            <div>Updated {new Date(data.generated_at).toLocaleString()} (refreshes every 30 minutes).</div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
