"use client"
import { useEffect, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { Panel, Notice, Loading, Button, TH, TD, ROW_BORDER } from "@/components/ui"
import { STORE_COLORS } from "@/lib/constants"
import type { CashflowData } from "@/lib/cashflow"
import { fetchEurRates, toEur, FALLBACK_RATES, type EurRates } from "@/lib/currency"

const eur = (n: number | null | undefined) =>
  n == null ? "—" : `${n < 0 ? "−" : ""}€${Math.abs(n).toLocaleString("en-IE", { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 })}`
const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })

function processorStatus(name: string, data: CashflowData): { connected: boolean; how: string } {
  if (name === "Shopify Payments") return { connected: true, how: "Connected via Windsor (payouts, pending balance, fees)." }
  if (name === "Whop") {
    if (data.whop_balance?.available) return { connected: true, how: `Balance $${data.whop_balance.balance_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} · pending $${data.whop_balance.pending_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` }
    if (data.whop_error) {
      const m = data.whop_error.match(/not authorized for the ([\w:]+) scope/i)
      return { connected: false, how: m ? `Whop key is missing the "${m[1]}" permission: in Whop → Developer → API keys, give the key that permission.` : `Whop API error: ${data.whop_error.slice(0, 160)}` }
    }
    return { connected: false, how: "Add WHOP_API_KEY in Vercel (Whop → Developer → API keys)." }
  }
  // Manual-entry processors show saved balance instead of setup instructions
  if (name === "PayPal" || name === "Whale Checkout" || name === "Other") return { connected: false, how: "" }
  return { connected: false, how: "Unknown gateway." }
}

// Hand-entered balances (PayPal, Whale Checkout, Other), saved in the database for everyone.
type Manual = Record<string, { balance: number; date: string }>
const OLD_MANUAL_KEY = "cashflow:manual-balances" // older browser-only copy, moved to the database once

function ManualBalanceCell({ processor, saved, onSave }: { processor: string; saved?: { balance: number; date: string }; onSave: (proc: string, v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState("")
  const commit = async () => {
    const v = Number(input.replace(",", "."))
    setEditing(false)
    if (input !== "" && Number.isFinite(v)) await onSave(processor, v)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>€</span>
        <input
          autoFocus
          className="bg-transparent border rounded px-1.5 py-0.5 text-[10px] w-20 tabular-nums"
          style={{ borderColor: "rgba(255,255,255,0.15)", color: "var(--text)" }}
          placeholder="0.00"
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/[^0-9.,-]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") setEditing(false)
          }}
          onBlur={commit}
        />
      </div>
    )
  }

  if (saved) {
    const age = Math.round((Date.now() - Date.parse(saved.date + "T12:00:00")) / 86400000)
    return (
      <button onClick={() => { setInput(String(saved.balance)); setEditing(true) }} className="text-left group" title="Click to update">
        <span className="tabular-nums" style={{ color: "var(--green)" }}>€{saved.balance.toLocaleString("en-IE", { maximumFractionDigits: 2 })}</span>
        <span className="text-[9px] ml-1" style={{ color: age > 7 ? "var(--orange)" : "var(--text-dim)" }}>({age === 0 ? "today" : `${age}d ago`})</span>
        <span className="text-[9px] ml-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-dim)" }}>update</span>
      </button>
    )
  }

  return (
    <button onClick={() => setEditing(true)} className="text-[10px] underline decoration-dotted underline-offset-2 hover:decoration-solid" style={{ color: "var(--orange)" }}>
      No API: enter the balance
    </button>
  )
}

const CACHE_KEY = "cashflow:v1"

export default function CashflowPage() {
  const [data, setData] = useState<CashflowData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [allDays, setAllDays] = useState(false)
  const [manual, setManual] = useState<Manual>({})
  const [rates, setRates] = useState<EurRates>(FALLBACK_RATES)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    fetchEurRates(today, today).then(setRates).catch(() => {})
    fetch("/api/processor-balances")
      .then((r) => r.json())
      .then(async (j) => {
        const m: Manual = {}
        for (const r of j.rows || []) m[r.processor] = { balance: Number(r.balance_eur), date: String(r.as_of).slice(0, 10) }
        // Move balances typed in before (saved only in this browser) to the database once
        try {
          const old = JSON.parse(localStorage.getItem(OLD_MANUAL_KEY) || "{}") as Record<string, { balance: string; date: string }>
          for (const [proc, v] of Object.entries(old)) {
            if (!m[proc] && Number.isFinite(Number(v.balance))) {
              await fetch("/api/processor-balances", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ processor: proc, balance_eur: Number(v.balance) }) })
              m[proc] = { balance: Number(v.balance), date: v.date }
            }
          }
          localStorage.removeItem(OLD_MANUAL_KEY)
        } catch {
          // nothing to move
        }
        setManual(m)
      })
      .catch(() => {})
  }, [])

  const saveManual = async (proc: string, v: number) => {
    const r = await fetch("/api/processor-balances", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ processor: proc, balance_eur: v }) })
    if (r.ok) setManual((m) => ({ ...m, [proc]: { balance: v, date: new Date().toISOString().slice(0, 10) } }))
  }

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
  const todayIso = new Date().toISOString().slice(0, 10)
  const whopEur = data?.whop_balance?.available ? toEur(data.whop_balance.balance_usd + data.whop_balance.pending_usd, "USD", todayIso, rates) : null
  const manualProcs = (data?.processors || []).map((p) => p.processor).filter((p) => p !== "Shopify Payments" && p !== "Whop")
  const manualTotal = manualProcs.reduce((a, p) => a + (manual[p]?.balance || 0), 0)
  const missingBal = (data?.processors || [])
    .filter((p) => p.incoming_30d > 0 && (p.processor === "Whop" ? whopEur == null : p.processor !== "Shopify Payments" && !manual[p.processor]))
    .map((p) => p.processor)
  const totalBalance = (t?.balance_known || 0) + (whopEur || 0) + manualTotal
  const days = data ? (allDays ? data.days : data.days.slice(0, 7)) : []

  return (
    <PageShell
      title="Cashflow & Balance"
      breadcrumb="Finance → Cashflow & Balance"
      description="Money coming in per payment processor, money going out (ads, COGS, refunds, fees) and what's still waiting in Shopify Payments. All in EUR."
      stats={[
        {
          label: "Balance, all processors",
          value: t ? eur(totalBalance) : "—",
          sub: t ? `Shopify ${eur(t.balance_known)}${whopEur != null ? ` · Whop ${eur(whopEur)}` : ""}${manualTotal ? ` · typed in ${eur(manualTotal)}` : ""}${missingBal.length ? ` · missing: ${missingBal.join(", ")}` : ""}` : undefined,
        },
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
                      {s.last_payout ? `${eur(s.last_payout.amount)} · ${fmtDay(s.last_payout.date)}` : s.pending + s.in_transit > 0 ? <span style={{ color: "var(--orange)" }} title="Money is waiting but Shopify paid nothing out in 30 days: check Shopify → Settings → Payments for a payout hold or missing bank details.">none in 30 days: check payout hold</span> : "none in 30 days"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {/* Whop balance */}
          {data.whop_balance?.available && (
            <div className="glass rounded-xl p-4">
              <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--text)" }}>
                Whop balance (USD){(data.whop_accounts?.length || 0) > 1 ? ` · ${data.whop_accounts!.length} accounts added up` : data.whop_accounts?.[0] ? ` · ${data.whop_accounts[0].label}` : ""}
              </div>
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
              {(data.whop_accounts?.length || 0) > 1 && (
                <div className="mt-3 pt-2 space-y-0.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Per account</div>
                  {data.whop_accounts!.map((a) => (
                    <div key={a.label} className="flex items-center justify-between text-[10px]">
                      <span style={{ color: "var(--text-muted)" }}>{a.label}</span>
                      {a.balance?.available ? (
                        <span className="tabular-nums" style={{ color: "var(--text)" }}>
                          ${a.balance.balance_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                          <span style={{ color: "var(--text-dim)" }}> · pending ${a.balance.pending_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                        </span>
                      ) : (
                        <span style={{ color: "var(--red)" }} title={a.error || undefined}>not connected: {(a.error || "no balance").slice(0, 80)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
                      <td className={`${TD} text-[10px] max-w-[320px]`} style={{ color: st.connected ? "var(--green)" : "var(--orange)" }}>
                        {st.how ? st.how : <ManualBalanceCell processor={p.processor} saved={manual[p.processor]} onSave={saveManual} />}
                      </td>
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
