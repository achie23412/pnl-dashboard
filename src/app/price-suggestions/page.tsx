"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { ProductLink } from "@/components/ProductLink"

interface Metrics {
  roas: number
  be_roas: number | null
  units_sold: number
  ad_spend: number
  cogs_usd: number | null
  margin_pct: number | null
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
}

interface Summary {
  total: number
  increases: number
  decreases: number
  avg_change_pct: number
  high_priority: number
}

const PRIORITY_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "rgba(239,68,68,0.12)", text: "#f87171", label: "High" },
  normal: { bg: "rgba(234,179,8,0.12)", text: "#facc15", label: "Normal" },
  low: { bg: "rgba(96,165,250,0.12)", text: "#60a5fa", label: "Low" },
}

const RULE_BADGE: Record<string, { bg: string; text: string }> = {
  thin_margin: { bg: "rgba(239,68,68,0.10)", text: "#f87171" },
  roas_downtrend: { bg: "rgba(251,146,60,0.10)", text: "#fb923c" },
  overpriced: { bg: "rgba(96,165,250,0.10)", text: "#60a5fa" },
  below_be: { bg: "rgba(234,179,8,0.10)", text: "#facc15" },
  high_cogs: { bg: "rgba(168,85,247,0.10)", text: "#a855f7" },
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
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setApplyResult(prev => ({ ...prev, [key]: { ok: false, msg: data.error || "Failed" } }))
      } else {
        setApplyResult(prev => ({ ...prev, [key]: { ok: true, msg: "Logged. Shopify push coming when tokens are set up." } }))
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

  const cogsColor = (pct: number) => {
    if (pct >= 28 && pct <= 32) return "#4ade80"
    if ((pct >= 25 && pct < 28) || (pct > 32 && pct <= 35)) return "#facc15"
    return "#f87171"
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
        { label: "High priority", value: summary ? String(summary.high_priority) : "—" },
      ]}
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterSelect label="Store" options={stores} value={filterStore} onChange={setFilterStore} />
        <FilterSelect label="Rule" options={rules} value={filterRule} onChange={setFilterRule} />
        <button
          onClick={fetchSuggestions}
          disabled={loading}
          className="ml-auto px-3 py-1.5 rounded-lg text-[11px] font-medium"
          style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="glass rounded-xl p-4 mb-4 text-[11px]" style={{ color: "#f87171" }}>
          {error}
        </div>
      )}

      {loading && !suggestions.length && (
        <div className="glass rounded-xl p-8 text-center">
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Loading product data and generating suggestions...</div>
        </div>
      )}

      {/* Rules legend */}
      {!loading && suggestions.length > 0 && (
        <div className="glass rounded-xl p-3 mb-4">
          <div className="text-[10px] font-semibold mb-2" style={{ color: "var(--text-muted)" }}>Rules applied</div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            <span className="px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.10)", color: "#f87171" }}>Thin margin: margin &lt; 25% → raise to 35%</span>
            <span className="px-2 py-0.5 rounded-full" style={{ background: "rgba(251,146,60,0.10)", color: "#fb923c" }}>ROAS downtrend: 1.0–2.2 → +10% (SOP rule 9)</span>
            <span className="px-2 py-0.5 rounded-full" style={{ background: "rgba(234,179,8,0.10)", color: "#facc15" }}>Below break-even: ROAS &lt; BE-ROAS → raise proportionally</span>
            <span className="px-2 py-0.5 rounded-full" style={{ background: "rgba(168,85,247,0.10)", color: "#a855f7" }}>COGS% too high: &gt;40% of price → target 30%</span>
            <span className="px-2 py-0.5 rounded-full" style={{ background: "rgba(96,165,250,0.10)", color: "#60a5fa" }}>Possibly overpriced: ROAS &gt;5 but ≤2 sales → −8%</span>
          </div>
          <div className="text-[9px] mt-2" style={{ color: "var(--text-dim)" }}>7-day cooldown per product after each price change. Only products with €5+ ad spend are evaluated.</div>
        </div>
      )}

      {/* Suggestions table */}
      {!loading && filtered.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Product</th>
                <th className="text-left px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Store</th>
                <th className="text-left px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Rule</th>
                <th className="text-right px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Current</th>
                <th className="text-right px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Suggested</th>
                <th className="text-right px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Change</th>
                <th className="text-right px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>
                  <div>COGS%</div>
                  <div className="text-[8px] font-normal" style={{ color: "var(--text-dim)" }}>now</div>
                </th>
                <th className="text-right px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>
                  <div>COGS%</div>
                  <div className="text-[8px] font-normal" style={{ color: "var(--text-dim)" }}>after</div>
                </th>
                <th className="text-right px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>ROAS</th>
                <th className="text-center px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const key = `${s.product_name}::${s.store}`
                const isExpanded = expanded === key
                const result = applyResult[key]
                const isOnCooldown = s.cooldown_until && new Date(s.cooldown_until) > new Date()
                const pb = PRIORITY_BADGE[s.priority]
                const rb = RULE_BADGE[s.rule_id] || { bg: "rgba(255,255,255,0.06)", text: "var(--text-muted)" }

                return (
                  <tr
                    key={i}
                    className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onClick={() => setExpanded(isExpanded ? null : key)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: pb.bg, color: pb.text }}>{pb.label}</span>
                        <ProductLink store={s.store} name={s.product_name} maxWidth={220} />
                      </div>
                      {isExpanded && (
                        <div className="mt-2 p-2 rounded-lg text-[10px] leading-relaxed" style={{ background: "rgba(255,255,255,0.02)", color: "var(--text-muted)" }}>
                          <div className="mb-1">{s.reason}</div>
                          <div className="flex gap-4 mt-1 text-[9px]" style={{ color: "var(--text-dim)" }}>
                            <span>Sold: {s.metrics.units_sold}</span>
                            <span>Spend: {eur(s.metrics.ad_spend)}</span>
                            {s.metrics.be_roas && <span>BE-ROAS: {s.metrics.be_roas.toFixed(2)}x</span>}
                            {s.metrics.margin_pct !== null && <span>Margin: {s.metrics.margin_pct}%</span>}
                            {s.metrics.cogs_usd !== null && <span>COGS: ${s.metrics.cogs_usd.toFixed(2)}</span>}
                          </div>
                          {result && (
                            <div className="mt-2 text-[10px]" style={{ color: result.ok ? "#4ade80" : "#f87171" }}>
                              {result.msg}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[10px]" style={{ color: "var(--text-muted)" }}>{s.store}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: rb.bg, color: rb.text }}>{s.rule}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>{eur(s.current_price)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-medium" style={{ color: s.change_pct > 0 ? "#4ade80" : "#60a5fa" }}>{eur(s.suggested_price)}</td>
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: s.change_pct > 0 ? "#4ade80" : "#60a5fa" }}>
                      {s.change_pct > 0 ? "+" : ""}{s.change_pct}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {s.metrics.cogs_usd !== null && s.current_price > 0 ? (
                        <span style={{ color: cogsColor((s.metrics.cogs_usd / s.current_price) * 100) }}>
                          {((s.metrics.cogs_usd / s.current_price) * 100).toFixed(1)}%
                        </span>
                      ) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {s.metrics.cogs_usd !== null && s.suggested_price > 0 ? (
                        <span style={{ color: cogsColor((s.metrics.cogs_usd / s.suggested_price) * 100) }}>
                          {((s.metrics.cogs_usd / s.suggested_price) * 100).toFixed(1)}%
                        </span>
                      ) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>{s.metrics.roas.toFixed(2)}x</td>
                    <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      {isOnCooldown ? (
                        <span className="text-[9px] px-2 py-1 rounded" style={{ color: "var(--text-dim)" }}>
                          Cooldown
                        </span>
                      ) : result?.ok ? (
                        <span className="text-[9px] px-2 py-1 rounded" style={{ color: "#4ade80" }}>Done</span>
                      ) : (
                        <button
                          onClick={() => handleApply(s)}
                          disabled={applying === key}
                          className="px-3 py-1 rounded-lg text-[10px] font-medium disabled:opacity-50 transition-colors"
                          style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}
                        >
                          {applying === key ? "..." : "Apply"}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && suggestions.length === 0 && !error && (
        <div className="glass rounded-xl p-8 text-center">
          <div className="text-[32px] mb-2 opacity-30">&#x2714;</div>
          <div className="text-[12px] font-medium mb-1" style={{ color: "var(--text)" }}>No price suggestions</div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>All products are within healthy pricing ranges, or none have enough ad spend (€25+) for analysis.</div>
        </div>
      )}
    </PageShell>
  )
}
