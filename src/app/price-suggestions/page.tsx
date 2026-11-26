"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { ProductLink } from "@/components/ProductLink"
import { FilterBar } from "@/components/PillSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { STORE_CURRENCY } from "@/lib/currency"
import { confirmTwice, logGoogleFeedChange } from "@/lib/feed-confirm"

const CURRENCY_SIGN: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" }

interface Metrics {
  roas: number
  be_roas: number | null
  units_sold: number
  ad_spend: number
  cogs_usd: number | null
  margin_pct: number | null
}

interface LadderStepDetail {
  step: number
  price: number
  change_pct: number
  cogs_pct: number | null
  estimated_date: string
}

interface Suggestion {
  product_name: string
  store: string
  current_price: number
  suggested_price: number
  change_pct: number
  rule: string
  rule_id: string
  reason: string
  priority: "high" | "normal" | "low"
  metrics: Metrics
  cooldown_until: string | null
  target_price: number | null
  steps_info: string
  all_steps: LadderStepDetail[]
}

interface Summary {
  total: number
  increases: number
  decreases: number
  avg_change_pct: number
  high_priority: number
}

type Tone = "red" | "amber" | "blue" | "grey"

const PRIORITY_BADGE: Record<string, { tone: Tone; label: string }> = {
  high: { tone: "red", label: "High" },
  normal: { tone: "amber", label: "Normal" },
  low: { tone: "blue", label: "Low" },
}

const RULE_TONE: Record<string, Tone> = {
  thin_margin: "red",
  roas_downtrend: "amber",
  overpriced: "blue",
  below_be: "red",
  high_cogs: "amber",
}

export default function PriceSuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [applying, setApplying] = useState<string | null>(null)
  const [applyResult, setApplyResult] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filterStore, setFilterStore] = useState<FilterValue>(EMPTY_FILTER)
  const [filterRule, setFilterRule] = useState<FilterValue>(EMPTY_FILTER)

  const fetchSuggestions = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/price-suggestions")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setSuggestions(data.suggestions || [])
      setSummary(data.summary || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSuggestions() }, [fetchSuggestions])

  const handleApply = async (s: Suggestion) => {
    const key = `${s.product_name}::${s.store}`
    const isMultiStep = s.all_steps && s.all_steps.length > 1
    const sign = CURRENCY_SIGN[STORE_CURRENCY[s.store] || "EUR"] || ""
    // Two confirmations; Google stores also show today's 10% feed counter
    const ok = await confirmTwice(s.store, `${isMultiStep ? "Start a price ladder" : "Apply a price change"} for "${s.product_name}" (${s.store}): ${sign}${s.current_price} → ${sign}${s.suggested_price}${isMultiStep ? ` (first step, target ${sign}${s.target_price})` : ""}.`)
    if (!ok) return
    setApplying(key)
    try {
      const res = await fetch("/api/price-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: s.product_name,
          store: s.store,
          old_price: s.current_price,
          new_price: s.suggested_price,
          change_pct: s.change_pct,
          rule: s.rule_id,
          ...(isMultiStep ? { target_price: s.target_price, all_steps: s.all_steps } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setApplyResult(prev => ({ ...prev, [key]: { ok: false, msg: data.error || "Failed" } }))
      } else {
        await logGoogleFeedChange({ store: s.store, product: s.product_name, oldValue: s.current_price, newValue: s.suggested_price, reason: `Price Suggestions: ${s.rule}` })
        setApplyResult(prev => ({ ...prev, [key]: { ok: true, msg: data.message || "Logged. Shopify push coming when tokens are set up." } }))
      }
    } catch (e) {
      setApplyResult(prev => ({ ...prev, [key]: { ok: false, msg: e instanceof Error ? e.message : String(e) } }))
    } finally {
      setApplying(null)
    }
  }

  const stores = Array.from(new Set(suggestions.map(s => s.store)))
  const rules = Array.from(new Set(suggestions.map(s => s.rule)))
  const filtered = suggestions.filter(s => {
    if (!passes(filterStore, s.store)) return false
    if (!passes(filterRule, s.rule)) return false
    return true
  })

  const eur = (n: number) => `€${n.toFixed(2)}`
  // Prices are in the store's own currency (S&A/Lumé USD, C&C GBP); ad spend is always EUR
  const money = (n: number, store: string) => `${CURRENCY_SIGN[STORE_CURRENCY[store] || "EUR"] || "€"}${n.toFixed(2)}`

  const cogsColor = (pct: number) => {
    if (pct >= 28 && pct <= 32) return "var(--green)"
    if ((pct >= 25 && pct < 28) || (pct > 32 && pct <= 35)) return "var(--orange)"
    return "var(--red)"
  }

  return (
    <PageShell
      title="Price Suggestions"
      breadcrumb="Front End → Price Suggestions"
      description="Data-driven pricing suggestions based on ROAS, break-even, COGS% and margin rules. Review before applying."
      stats={[
        { label: "Suggestions", value: summary ? String(summary.total) : "—" },
        { label: "Price increases", value: summary ? String(summary.increases) : "—" },
        { label: "Price decreases", value: summary ? String(summary.decreases) : "—" },
        { label: "High priority", value: summary ? String(summary.high_priority) : "—", color: summary && summary.high_priority > 0 ? "var(--red)" : undefined },
      ]}
      actions={
        <Button onClick={fetchSuggestions} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      }
    >
      {/* Filters */}
      <FilterBar>
        <FilterSelect label="Store" options={stores} value={filterStore} onChange={setFilterStore} />
        <FilterSelect label="Rule" options={rules} value={filterRule} onChange={setFilterRule} />
      </FilterBar>

      {error && <Notice tone="error">Couldn&apos;t load price suggestions: {error}.</Notice>}

      {loading && !suggestions.length && <Loading>Loading product data and price suggestions…</Loading>}

      {/* Rules legend */}
      {!loading && suggestions.length > 0 && (
        <Panel className="mb-4" title="Rules applied" sub="7-day cooldown per product after each price change. Only products with €5+ ad spend are evaluated. Max +10% per step (like Price Ladder).">
          <div className="flex flex-wrap gap-2">
            <Badge tone="red">Thin margin: margin &lt; 25% → raise to 35%</Badge>
            <Badge tone="amber">ROAS downtrend: 1.0–2.2 → +10% (SOP rule 9)</Badge>
            <Badge tone="red">Below breakeven: ROAS &lt; BE ROAS → raise proportionally</Badge>
            <Badge tone="amber">COGS% too high: &gt;40% of price → target 30%</Badge>
            <Badge tone="blue">Possibly overpriced: ROAS &gt;5 but ≤2 sales → −8%</Badge>
          </div>
        </Panel>
      )}

      {/* Suggestions table */}
      {!loading && filtered.length > 0 && (
        <Panel pad={false}>
          <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Product</th>
                <th className={`${TH} text-left`}>Store</th>
                <th className={`${TH} text-left`}>Rule</th>
                <th className={`${TH} text-right`}>Current</th>
                <th className={`${TH} text-right`}>Suggested</th>
                <th className={`${TH} text-right`}>Change</th>
                <th className={`${TH} text-right`}>
                  <div>COGS%</div>
                  <div className="text-[8px] font-normal normal-case">now</div>
                </th>
                <th className={`${TH} text-right`}>
                  <div>COGS%</div>
                  <div className="text-[8px] font-normal normal-case">after</div>
                </th>
                <th className={`${TH} text-right`}>ROAS</th>
                <th className={`${TH} text-center`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const key = `${s.product_name}::${s.store}`
                const isExpanded = expanded === key
                const result = applyResult[key]
                const isOnCooldown = s.cooldown_until && new Date(s.cooldown_until) > new Date()
                const pb = PRIORITY_BADGE[s.priority]
                const ruleTone = RULE_TONE[s.rule_id] || "grey"

                return (
                  <tr
                    key={i}
                    className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                    style={ROW_BORDER}
                    onClick={() => setExpanded(isExpanded ? null : key)}
                  >
                    <td className={TD}>
                      <div className="flex items-center gap-2">
                        <Badge tone={pb.tone}>{pb.label}</Badge>
                        <ProductLink store={s.store} name={s.product_name} maxWidth={220} />
                      </div>
                      {isExpanded && (
                        <div className="mt-2 p-2 rounded-lg text-[10px] leading-relaxed" style={{ background: "rgba(255,255,255,0.02)", color: "var(--text-muted)" }}>
                          <div className="mb-1">{s.reason}</div>
                          <div className="flex flex-wrap gap-4 mt-1 text-[9px]" style={{ color: "var(--text-dim)" }}>
                            <span>Sold: {s.metrics.units_sold}</span>
                            <span>Spend: {eur(s.metrics.ad_spend)}</span>
                            {s.metrics.be_roas && <span>BE ROAS: {s.metrics.be_roas.toFixed(2)}x</span>}
                            {s.metrics.margin_pct !== null && <span>Margin: {s.metrics.margin_pct}%</span>}
                            {s.metrics.cogs_usd !== null && <span>COGS: ${s.metrics.cogs_usd.toFixed(2)} USD</span>}
                            {s.target_price !== null && <span style={{ color: "var(--orange)" }}>Target: {money(s.target_price, s.store)}</span>}
                          </div>
                          {/* Price Ladder Steps */}
                          {s.all_steps && s.all_steps.length > 1 && (
                            <div className="mt-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                              <div className="text-[10px] font-medium mb-2" style={{ color: "var(--text)" }}>
                                Price Ladder — {s.all_steps.length} steps to {money(s.target_price!, s.store)}
                              </div>
                              <div className="flex flex-col gap-0">
                                {/* Start: current price */}
                                <div className="flex items-center gap-2 text-[9px] py-0.5">
                                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "var(--text-dim)", border: "2px solid var(--text-muted)" }} />
                                  <span className="tabular-nums" style={{ color: "var(--text-muted)", minWidth: 48 }}>Now</span>
                                  <span className="tabular-nums font-medium" style={{ color: "var(--text)" }}>{money(s.current_price, s.store)}</span>
                                </div>
                                {s.all_steps.map((step, si) => (
                                  <div key={si} className="flex items-center gap-2 text-[9px] py-0.5">
                                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{
                                      background: si === s.all_steps.length - 1 ? "var(--green)" : "var(--orange)",
                                      border: si === s.all_steps.length - 1 ? "2px solid var(--green)" : "2px solid var(--orange)",
                                    }} />
                                    <span className="tabular-nums" style={{ color: "var(--text-dim)", minWidth: 48 }}>
                                      {new Date(step.estimated_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                    </span>
                                    <span className="tabular-nums font-medium" style={{ color: "var(--text)" }}>{money(step.price, s.store)}</span>
                                    <span style={{ color: "var(--green)" }}>+{step.change_pct}%</span>
                                    {step.cogs_pct !== null && (
                                      <span style={{ color: cogsColor(step.cogs_pct) }}>COGS {step.cogs_pct}%</span>
                                    )}
                                    {si === s.all_steps.length - 1 && <Badge tone="green">Target</Badge>}
                                  </div>
                                ))}
                              </div>
                              <div className="mt-1.5 text-[8px]" style={{ color: "var(--text-dim)" }}>
                                Each step auto-advances after 7-day cooldown. Max +10% per step.
                              </div>
                            </div>
                          )}
                          {result && (
                            <div className="mt-2 text-[10px]" style={{ color: result.ok ? "var(--green)" : "var(--red)" }}>
                              {result.msg}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{s.store}</td>
                    <td className={TD}>
                      <Badge tone={ruleTone}>{s.rule}</Badge>
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{money(s.current_price, s.store)}</td>
                    <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: s.change_pct > 0 ? "var(--green)" : "var(--blue)" }}>
                      {money(s.suggested_price, s.store)}
                      {s.steps_info && (
                        <div className="text-[8px] font-normal" style={{ color: "var(--text-dim)" }}>{s.steps_info}</div>
                      )}
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: s.change_pct > 0 ? "var(--green)" : "var(--blue)" }}>
                      {s.change_pct > 0 ? "+" : ""}{s.change_pct}%
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {s.metrics.cogs_usd !== null && s.current_price > 0 ? (
                        <span style={{ color: cogsColor((s.metrics.cogs_usd / s.current_price) * 100) }}>
                          {((s.metrics.cogs_usd / s.current_price) * 100).toFixed(1)}%
                        </span>
                      ) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {s.metrics.cogs_usd !== null && s.suggested_price > 0 ? (
                        <span style={{ color: cogsColor((s.metrics.cogs_usd / s.suggested_price) * 100) }}>
                          {((s.metrics.cogs_usd / s.suggested_price) * 100).toFixed(1)}%
                        </span>
                      ) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{s.metrics.roas.toFixed(2)}x</td>
                    <td className={`${TD} text-center`} onClick={e => e.stopPropagation()}>
                      {isOnCooldown ? (
                        <Badge tone="grey">Cooldown</Badge>
                      ) : result?.ok ? (
                        <Badge tone="green">Done</Badge>
                      ) : (
                        <Button size="sm" onClick={() => handleApply(s)} disabled={applying === key}>
                          {applying === key ? "Applying…" : (s.all_steps && s.all_steps.length > 1 ? "Start Ladder" : "Apply")}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </Panel>
      )}

      {!loading && suggestions.length === 0 && !error && (
        <EmptyState title="No price suggestions">All products are within healthy pricing ranges, or none have enough ad spend (€5+) for analysis.</EmptyState>
      )}
    </PageShell>
  )
}
