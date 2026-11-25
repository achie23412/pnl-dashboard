"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { PillSelect } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { ProductLink } from "@/components/ProductLink"

interface SupplierProduct {
  title: string
  variant_title: string
  store: string
  total_qty: number
  total_cogs: number
  total_sold: number
  avg_cost: number
  min_cost: number
  max_cost: number
  cost_variance: number
  sale_price: number
  quote_price: number | null
  orders: number
  last_order_date: string
  cogs_pct: number | null
  price_alert: string | null
  negotiation_alert: string | null
  cogs_alert: string | null
  cogs_action: string | null
}

interface Summary {
  products_tracked: number
  products_with_alerts: number
  active_stores: number
  avg_cogs_unit: number
  cogs_out_of_range: number
  cogs_above_32: number
  cogs_below_28: number
}

function cogsColor(pct: number | null): string {
  if (pct === null) return "var(--text-dim)"
  if (pct >= 28 && pct <= 32) return "#4ade80"
  if (pct > 32 && pct <= 35) return "#facc15"
  if (pct >= 25 && pct < 28) return "#facc15"
  return "#f87171"
}

function cogsBadge(pct: number | null): { label: string; bg: string; fg: string } | null {
  if (pct === null) return null
  if (pct >= 28 && pct <= 32) return { label: "OK", bg: "rgba(74,222,128,0.12)", fg: "#4ade80" }
  if (pct > 32) return { label: "High", bg: "rgba(239,68,68,0.12)", fg: "#f87171" }
  return { label: "Low", bg: "rgba(250,204,21,0.12)", fg: "#facc15" }
}

export default function SupplierCostsPage() {
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filterStore, setFilterStore] = useState<FilterValue>(EMPTY_FILTER)
  const [filterAlerts, setFilterAlerts] = useState("all")
  const [sortBy, setSortBy] = useState<"qty" | "cogs" | "variance" | "cogs_pct">("qty")
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/supplier-data")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setProducts(data.products || [])
      setSummary(data.summary || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const stores = Array.from(new Set(products.map((p) => p.store)))
  const filtered = products
    .filter((p) => {
      if (!passes(filterStore, p.store)) return false
      if (filterAlerts === "price" && !p.price_alert) return false
      if (filterAlerts === "negotiate" && !p.negotiation_alert) return false
      if (filterAlerts === "cogs" && !p.cogs_alert) return false
      if (filterAlerts === "any" && !p.price_alert && !p.negotiation_alert && !p.cogs_alert) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === "qty") return b.total_qty - a.total_qty
      if (sortBy === "cogs") return b.total_cogs - a.total_cogs
      if (sortBy === "cogs_pct") return (b.cogs_pct ?? 0) - (a.cogs_pct ?? 0)
      return b.cost_variance - a.cost_variance
    })

  const usd = (n: number) => `$${n.toFixed(2)}`
  const alertCount = products.filter((p) => p.price_alert || p.negotiation_alert || p.cogs_alert).length
  const priceAlerts = products.filter((p) => p.price_alert).length
  const negotiateAlerts = products.filter((p) => p.negotiation_alert).length
  const cogsAlerts = products.filter((p) => p.cogs_alert).length
  const inRange = products.filter((p) => p.cogs_pct !== null && p.cogs_pct >= 28 && p.cogs_pct <= 32).length

  return (
    <PageShell
      title="Supplier Costs"
      breadcrumb="Finance → Supplier Costs"
      description="Per-product COGS from ShipGoods. Target COGS%: 28–32% of sale price. Review alerts and take action."
      stats={[
        { label: "Products tracked", value: summary ? String(summary.products_tracked) : "—" },
        { label: "Avg COGS/unit", value: summary ? usd(summary.avg_cogs_unit) : "—" },
        { label: "COGS% in range", value: loading ? "—" : `${inRange}/${products.filter((p) => p.cogs_pct !== null).length}` },
        { label: "COGS% alerts", value: loading ? "—" : String(cogsAlerts), color: cogsAlerts > 0 ? "#f87171" : undefined },
      ]}
    >
      {/* Alerts banner */}
      {!loading && alertCount > 0 && (
        <div className="glass rounded-xl p-3 mb-4" style={{ borderLeft: "3px solid #facc15" }}>
          <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--text)" }}>
            {alertCount} action{alertCount !== 1 ? "s" : ""} needed
          </div>
          <div className="flex flex-wrap gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
            {cogsAlerts > 0 && (
              <span className="px-2 py-0.5 rounded-full cursor-pointer" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}
                onClick={() => setFilterAlerts("cogs")}>
                {summary?.cogs_above_32 ?? 0} above 32% · {summary?.cogs_below_28 ?? 0} below 28% — review pricing
              </span>
            )}
            {priceAlerts > 0 && (
              <span className="px-2 py-0.5 rounded-full cursor-pointer" style={{ background: "rgba(250,204,21,0.12)", color: "#facc15" }}
                onClick={() => setFilterAlerts("price")}>
                {priceAlerts} price mismatch{priceAlerts !== 1 ? "es" : ""} — ask supplier
              </span>
            )}
            {negotiateAlerts > 0 && (
              <span className="px-2 py-0.5 rounded-full cursor-pointer" style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8" }}
                onClick={() => setFilterAlerts("negotiate")}>
                {negotiateAlerts} product{negotiateAlerts !== 1 ? "s" : ""} — request volume discount
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterSelect label="Store" options={stores} value={filterStore} onChange={setFilterStore} />
        <PillSelect
          label="Show"
          value={filterAlerts}
          onChange={setFilterAlerts}
          options={[
            { value: "all", label: "All products" },
            { value: "any", label: "With alerts" },
            { value: "cogs", label: "COGS% out of range" },
            { value: "price", label: "Price mismatches" },
            { value: "negotiate", label: "Volume negotiate" },
          ]}
        />
        <PillSelect
          label="Sort"
          value={sortBy}
          onChange={(v) => setSortBy(v as typeof sortBy)}
          options={[
            { value: "qty", label: "Quantity" },
            { value: "cogs", label: "Total COGS" },
            { value: "cogs_pct", label: "COGS%" },
            { value: "variance", label: "Price variance" },
          ]}
        />
        <span className="text-[10px] ml-auto" style={{ color: "var(--text-dim)" }}>
          {filtered.length} products
        </span>
        <button onClick={fetchData} disabled={loading}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
          style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="glass rounded-xl p-4 mb-4 text-[11px]" style={{ color: "#f87171" }}>{error}</div>
      )}

      {loading && products.length === 0 && (
        <div className="glass rounded-xl p-8 text-center">
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Loading supplier cost data from ShipGoods...</div>
        </div>
      )}

      {/* Product cost table */}
      {!loading && filtered.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Product</th>
                <th className="text-left px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Store</th>
                <th className="text-right px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Qty (30d)</th>
                <th className="text-right px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Sale Price</th>
                <th className="text-right px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Avg Cost</th>
                <th className="text-right px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>
                  COGS%
                  <span className="block text-[8px] font-normal" style={{ color: "var(--text-dim)" }}>target 28–32%</span>
                </th>
                <th className="text-center px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="text-center px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const key = `${p.title}::${p.variant_title}::${p.store}`
                const isExpanded = expanded === key
                const badge = cogsBadge(p.cogs_pct)
                const hasAnyAlert = p.price_alert || p.negotiation_alert || p.cogs_alert
                return (
                  <tr key={i}
                    className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onClick={() => setExpanded(isExpanded ? null : key)}>
                    <td className="px-4 py-2.5">
                      <div><ProductLink store={p.store} name={p.title} maxWidth={220} /></div>
                      {p.variant_title && <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.variant_title}</div>}
                      {isExpanded && (
                        <div className="mt-2 p-2 rounded-lg text-[10px] space-y-1" style={{ background: "rgba(255,255,255,0.02)" }}>
                          <div className="flex gap-4" style={{ color: "var(--text-muted)" }}>
                            <span>Orders: {p.orders}</span>
                            <span>Total COGS: {usd(p.total_cogs)}</span>
                            <span>Total revenue: {usd(p.total_sold)}</span>
                          </div>
                          <div className="flex gap-4" style={{ color: "var(--text-dim)" }}>
                            <span>Cost range: {usd(p.min_cost)} – {usd(p.max_cost)}</span>
                            {p.quote_price !== null && <span>Quote: {usd(p.quote_price)}</span>}
                            <span>Last order: {p.last_order_date}</span>
                          </div>
                          {p.cogs_alert && (
                            <div className="mt-1 px-2 py-1 rounded" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171" }}>
                              ⚠ {p.cogs_alert}
                            </div>
                          )}
                          {p.cogs_action && (
                            <div className="mt-1 px-2 py-1 rounded" style={{ background: "rgba(99,102,241,0.08)", color: "#818cf8" }}>
                              → {p.cogs_action}
                            </div>
                          )}
                          {p.price_alert && (
                            <div className="mt-1 px-2 py-1 rounded" style={{ background: "rgba(250,204,21,0.08)", color: "#facc15" }}>
                              {p.price_alert}
                            </div>
                          )}
                          {p.negotiation_alert && (
                            <div className="mt-1 px-2 py-1 rounded" style={{ background: "rgba(99,102,241,0.08)", color: "#818cf8" }}>
                              {p.negotiation_alert}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[10px]" style={{ color: "var(--text-muted)" }}>{p.store}</td>
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>{p.total_qty}</td>
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>
                      {p.sale_price > 0 ? usd(p.sale_price) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>{usd(p.avg_cost)}</td>
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: cogsColor(p.cogs_pct) }}>
                      {p.cogs_pct !== null ? `${p.cogs_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {badge && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-medium" style={{ background: badge.bg, color: badge.fg }}>
                          {badge.label}
                        </span>
                      )}
                      {!badge && <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {p.cogs_alert && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-medium"
                            style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}
                            title={p.cogs_action || p.cogs_alert}>
                            COGS
                          </span>
                        )}
                        {p.price_alert && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-medium"
                            style={{ background: "rgba(250,204,21,0.12)", color: "#facc15" }}
                            title={p.price_alert}>
                            Price
                          </span>
                        )}
                        {p.negotiation_alert && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-medium"
                            style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8" }}
                            title={p.negotiation_alert}>
                            Volume
                          </span>
                        )}
                        {!hasAnyAlert && <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>—</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && products.length === 0 && !error && (
        <div className="glass rounded-xl p-8 text-center">
          <div className="text-[13px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>No supplier cost data</div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Check that SHIPGOODS_TOKEN is set in Vercel environment variables.</div>
        </div>
      )}
    </PageShell>
  )
}
