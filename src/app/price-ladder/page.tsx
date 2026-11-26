"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { FilterBar } from "@/components/PillSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { STORE_CURRENCY } from "@/lib/currency"

const CURRENCY_SIGN: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" }

interface Ladder {
  id: number
  store: string
  product_name: string
  start_price: number
  target_price: number
  steps: number[]
  current_step: number
  current_price: number
  next_price: number | null
  is_last: boolean
  total_steps: number
  max_drop_pct: number
  status: string
  created_at: string
  cogs_usd: number | null
  cogs_pct_current: number | null
  cogs_pct_next: number | null
  current_orders_day: number | null
  last_step_orders_day: number | null
  last_step_date: string | null
  orders_drop_pct: number | null
  can_advance: boolean
  advance_reason: string
}

interface Summary {
  total: number
  active: number
  ready: number
  completed: number
}

interface CatalogProduct {
  product_name: string
  store: string
  sales_revenue: number
  units_sold: number
  retail_price: string
}

export default function PriceLadderPage() {
  const [ladders, setLadders] = useState<Ladder[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [filterStore, setFilterStore] = useState<FilterValue>(EMPTY_FILTER)
  const [filterStatus, setFilterStatus] = useState<FilterValue>(EMPTY_FILTER)
  const [acting, setActing] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  // New ladder form
  const [showForm, setShowForm] = useState(false)
  const [catalog, setCatalog] = useState<CatalogProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [formStore, setFormStore] = useState("")
  const [formProduct, setFormProduct] = useState("")
  const [formTarget, setFormTarget] = useState("")
  const [formError, setFormError] = useState("")
  const [creating, setCreating] = useState(false)

  const fetchLadders = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/price-ladder")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setLadders(data.ladders || [])
      setSummary(data.summary || null)
      if (data.setup_needed) setSetupNeeded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLadders() }, [fetchLadders])

  const fetchCatalog = useCallback(async () => {
    setCatalogLoading(true)
    try {
      const res = await fetch("/api/product-catalog?store=all")
      const data = await res.json()
      if (res.ok) setCatalog(data.products || [])
    } catch { /* ignore */ }
    setCatalogLoading(false)
  }, [])

  const handleShowForm = () => {
    if (!showForm && catalog.length === 0) fetchCatalog()
    setShowForm(!showForm)
    setFormError("")
  }

  const handleCreate = async () => {
    if (!formStore || !formProduct || !formTarget) {
      setFormError("Fill in all fields")
      return
    }
    const target = parseFloat(formTarget)
    if (!target || target <= 0) {
      setFormError("Invalid target price")
      return
    }
    setCreating(true)
    setFormError("")
    try {
      const res = await fetch("/api/price-ladder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: formProduct, store: formStore, target_price: target }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setShowForm(false)
      setFormStore("")
      setFormProduct("")
      setFormTarget("")
      fetchLadders()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const handleAction = async (ladderId: number, action: string) => {
    setActing(ladderId)
    try {
      const res = await fetch("/api/price-ladder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ladder_id: ladderId, action }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed")
      }
      fetchLadders()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActing(null)
    }
  }

  const stores = Array.from(new Set(ladders.map((l) => l.store)))
  const statuses = Array.from(new Set(ladders.map((l) => l.status)))
  const filtered = ladders.filter((l) => {
    if (!passes(filterStore, l.store)) return false
    if (!passes(filterStatus, l.status)) return false
    return true
  })

  const money = (n: number, store: string) =>
    `${CURRENCY_SIGN[STORE_CURRENCY[store] || "EUR"] || "€"}${n.toFixed(2)}`

  const cogsColor = (pct: number) => {
    if (pct >= 25 && pct <= 32) return "var(--green)"
    if ((pct >= 20 && pct < 25) || (pct > 32 && pct <= 38)) return "var(--orange)"
    return "var(--red)"
  }

  const statusTone = (s: string): "green" | "amber" | "grey" | "red" | "blue" => {
    if (s === "active") return "green"
    if (s === "paused") return "amber"
    if (s === "completed") return "blue"
    return "grey"
  }

  // Product list for the form, filtered by selected store
  const formProducts = formStore
    ? Array.from(new Set(catalog.filter((p) => p.store === formStore).map((p) => p.product_name))).sort()
    : []

  const currentFormPrice = (() => {
    if (!formStore || !formProduct) return null
    const p = catalog.find((c) => c.product_name === formProduct && c.store === formStore)
    if (!p) return null
    return p.sales_revenue > 0 && p.units_sold > 0
      ? Math.round((p.sales_revenue / p.units_sold) * 100) / 100
      : parseFloat(p.retail_price) || null
  })()

  return (
    <PageShell
      title="Price Ladder"
      breadcrumb="Front End → Price Ladder"
      description="Raise prices in slow steps instead of one big jump. Track orders/day between steps — advance only when performance holds."
      stats={[
        { label: "Active ladders", value: summary ? String(summary.active) : "—" },
        { label: "Ready to advance", value: summary ? String(summary.ready) : "—", color: summary && summary.ready > 0 ? "var(--green)" : undefined },
        { label: "Completed", value: summary ? String(summary.completed) : "—" },
      ]}
      actions={
        <div className="flex gap-2">
          <Button onClick={handleShowForm}>{showForm ? "Cancel" : "New Ladder"}</Button>
          <Button onClick={fetchLadders} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button>
        </div>
      }
    >
      {setupNeeded && (
        <Notice tone="warning">
          The price_ladders table doesn&apos;t exist yet. Run the migration SQL in the Supabase SQL editor (see the API route source for the SQL).
        </Notice>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {/* New Ladder form */}
      {showForm && (
        <Panel title="Create Price Ladder" sub="Pick a product and target price. Steps are auto-generated with .95 endings.">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>Store</label>
              <select
                value={formStore}
                onChange={(e) => { setFormStore(e.target.value); setFormProduct("") }}
                className="rounded-lg px-2 py-1.5 text-[11px] outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)", minWidth: 160 }}
              >
                <option value="">Select store…</option>
                {Array.from(new Set(catalog.map((p) => p.store))).sort().map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>Product</label>
              <select
                value={formProduct}
                onChange={(e) => setFormProduct(e.target.value)}
                disabled={!formStore}
                className="rounded-lg px-2 py-1.5 text-[11px] outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)", minWidth: 240, maxWidth: 320 }}
              >
                <option value="">{catalogLoading ? "Loading…" : "Select product…"}</option>
                {formProducts.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            {currentFormPrice !== null && (
              <div>
                <label className="block text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>Current price</label>
                <div className="text-[11px] py-1.5" style={{ color: "var(--text-muted)" }}>
                  {money(currentFormPrice, formStore)}
                </div>
              </div>
            )}
            <div>
              <label className="block text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>Target price</label>
              <input
                type="number"
                step="0.01"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                placeholder="89.95"
                className="rounded-lg px-2 py-1.5 text-[11px] outline-none w-24"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }}
              />
            </div>
            <Button variant="primary" onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Create Ladder"}
            </Button>
          </div>
          {formError && <div className="mt-2 text-[10px]" style={{ color: "var(--red, #f87171)" }}>{formError}</div>}
          {currentFormPrice !== null && formTarget && parseFloat(formTarget) > currentFormPrice && (
            <div className="mt-2 text-[10px]" style={{ color: "var(--text-dim)" }}>
              Preview: {money(currentFormPrice, formStore)} → {money(parseFloat(formTarget), formStore)} in ~{Math.max(2, Math.round(Math.abs(parseFloat(formTarget) - currentFormPrice) / 3) + 2)} steps
            </div>
          )}
        </Panel>
      )}

      <FilterBar>
        <FilterSelect label="Store" options={stores} value={filterStore} onChange={setFilterStore} />
        <FilterSelect label="Status" options={statuses} value={filterStatus} onChange={setFilterStatus} />
      </FilterBar>

      {loading && !ladders.length && <Loading>Loading price ladders…</Loading>}

      {/* How it works */}
      {!loading && ladders.length > 0 && (
        <Panel className="mb-4" title="How it works" sub="Suggestions only — never changes Shopify prices automatically.">
          <div className="flex flex-wrap gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <Badge tone="green">1. Create a ladder with start → target price</Badge>
            <Badge tone="blue">2. Steps auto-generated (.95 endings, ~3€ apart)</Badge>
            <Badge tone="amber">3. Advance only when orders/day held (default: &lt;15% drop)</Badge>
            <Badge tone="grey">4. Every step logged — change Shopify price yourself</Badge>
          </div>
        </Panel>
      )}

      {/* Ladders table */}
      {!loading && filtered.length > 0 && (
        <Panel pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", color: "var(--text-dim)" }}>
                  <th className={`${TH} text-left`}>Product</th>
                  <th className={`${TH} text-left`}>Store</th>
                  <th className={`${TH} text-center`}>Step</th>
                  <th className={`${TH} text-right`}>Current</th>
                  <th className={`${TH} text-right`}>Next</th>
                  <th className={`${TH} text-right`}>Target</th>
                  <th className={`${TH} text-right`}>
                    <div>COGS%</div>
                    <div className="text-[8px] font-normal normal-case">now</div>
                  </th>
                  <th className={`${TH} text-right`}>
                    <div>COGS%</div>
                    <div className="text-[8px] font-normal normal-case">next</div>
                  </th>
                  <th className={`${TH} text-right`}>
                    <div>Orders/d</div>
                    <div className="text-[8px] font-normal normal-case">now</div>
                  </th>
                  <th className={`${TH} text-right`}>
                    <div>Orders/d</div>
                    <div className="text-[8px] font-normal normal-case">prev step</div>
                  </th>
                  <th className={`${TH} text-right`}>Drop</th>
                  <th className={`${TH} text-center`}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const isExpanded = expanded === l.id
                  const progress = l.total_steps > 1 ? ((l.current_step) / (l.total_steps - 1)) * 100 : 0

                  return (
                    <tr
                      key={l.id}
                      className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                      style={ROW_BORDER}
                      onClick={() => setExpanded(isExpanded ? null : l.id)}
                    >
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          <Badge tone={statusTone(l.status)}>
                            {l.status === "active" ? (l.can_advance && !l.is_last ? "Ready" : l.is_last ? "Done" : "Wait") : l.status}
                          </Badge>
                          <span className="truncate max-w-[200px]" style={{ color: "var(--text)" }} title={l.product_name}>
                            {l.product_name}
                          </span>
                        </div>
                        {isExpanded && (
                          <div className="mt-2 p-2 rounded-lg text-[10px] leading-relaxed" style={{ background: "rgba(255,255,255,0.02)", color: "var(--text-muted)" }}>
                            <div className="mb-1.5 font-medium" style={{ color: "var(--text)" }}>Ladder steps</div>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {l.steps.map((step, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded text-[9px]"
                                  style={{
                                    background: i === l.current_step ? "rgba(99,102,241,0.2)" : i < l.current_step ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)",
                                    color: i === l.current_step ? "#c7d2fe" : i < l.current_step ? "#4ade80" : "var(--text-dim)",
                                    border: i === l.current_step ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent",
                                  }}
                                >
                                  {money(step, l.store)}
                                </span>
                              ))}
                            </div>
                            {/* Progress bar */}
                            <div className="h-1.5 rounded-full mb-2" style={{ background: "rgba(255,255,255,0.06)" }}>
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${progress}%`, background: l.is_last ? "var(--green)" : "var(--accent)" }}
                              />
                            </div>
                            <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>
                              {l.advance_reason}
                              {l.last_step_date && (
                                <span> · Last step: {new Date(l.last_step_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                              )}
                              {l.max_drop_pct !== 15 && <span> · Threshold: {l.max_drop_pct}%</span>}
                            </div>
                            {l.status === "active" && !l.is_last && (
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" onClick={(e) => { e.stopPropagation(); handleAction(l.id, "pause") }} disabled={acting === l.id}>
                                  Pause
                                </Button>
                                <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleAction(l.id, "cancel") }} disabled={acting === l.id}>
                                  Cancel
                                </Button>
                              </div>
                            )}
                            {l.status === "paused" && (
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" onClick={(e) => { e.stopPropagation(); handleAction(l.id, "resume") }} disabled={acting === l.id}>
                                  Resume
                                </Button>
                                <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleAction(l.id, "cancel") }} disabled={acting === l.id}>
                                  Cancel
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{l.store}</td>
                      <td className={`${TD} text-center tabular-nums`} style={{ color: "var(--text-muted)" }}>
                        {l.current_step + 1}/{l.total_steps}
                      </td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>
                        {money(l.current_price, l.store)}
                      </td>
                      <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: l.next_price ? "var(--accent)" : "var(--text-dim)" }}>
                        {l.next_price ? money(l.next_price, l.store) : "—"}
                      </td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-dim)" }}>
                        {money(l.target_price, l.store)}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {l.cogs_pct_current !== null ? (
                          <span style={{ color: cogsColor(l.cogs_pct_current) }}>{l.cogs_pct_current.toFixed(1)}%</span>
                        ) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {l.cogs_pct_next !== null ? (
                          <span style={{ color: cogsColor(l.cogs_pct_next) }}>{l.cogs_pct_next.toFixed(1)}%</span>
                        ) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                      </td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>
                        {l.current_orders_day !== null ? l.current_orders_day.toFixed(1) : "—"}
                      </td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>
                        {l.last_step_orders_day !== null ? l.last_step_orders_day.toFixed(1) : "—"}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {l.orders_drop_pct !== null ? (
                          <span style={{ color: l.orders_drop_pct >= 0 ? "var(--green)" : l.orders_drop_pct > -l.max_drop_pct ? "var(--orange)" : "var(--red)" }}>
                            {l.orders_drop_pct >= 0 ? "+" : ""}{l.orders_drop_pct.toFixed(1)}%
                          </span>
                        ) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                      </td>
                      <td className={`${TD} text-center`} onClick={(e) => e.stopPropagation()}>
                        {l.status === "active" && !l.is_last && l.can_advance ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleAction(l.id, "advance")}
                            disabled={acting === l.id}
                          >
                            {acting === l.id ? "…" : "Advance"}
                          </Button>
                        ) : l.is_last ? (
                          <Badge tone="green">Target</Badge>
                        ) : l.status === "active" ? (
                          <Badge tone="amber">Wait</Badge>
                        ) : (
                          <Badge tone="grey">{l.status}</Badge>
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

      {!loading && ladders.length === 0 && !error && !setupNeeded && (
        <EmptyState title="No price ladders yet">
          Click &quot;New Ladder&quot; to start raising a product&apos;s price in slow steps.
        </EmptyState>
      )}
    </PageShell>
  )
}
