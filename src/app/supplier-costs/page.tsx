"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { ProductLink } from "@/components/ProductLink"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"

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
  if (pct >= 28 && pct <= 32) return "var(--green)"
  if (pct > 32 && pct <= 35) return "var(--orange)"
  if (pct >= 25 && pct < 28) return "var(--orange)"
  return "var(--red)"
}

function cogsBadge(pct: number | null): { label: string; tone: "green" | "red" | "amber" } | null {
  if (pct === null) return null
  if (pct >= 28 && pct <= 32) return { label: "OK", tone: "green" }
  if (pct > 32) return { label: "High", tone: "red" }
  return { label: "Low", tone: "amber" }
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
        { label: "Avg COGS per unit (USD)", value: summary ? usd(summary.avg_cogs_unit) : "—" },
        { label: "COGS% in range", value: loading ? "—" : `${inRange}/${products.filter((p) => p.cogs_pct !== null).length}` },
        { label: "COGS% alerts", value: loading ? "—" : String(cogsAlerts), color: cogsAlerts > 0 ? "var(--red)" : undefined },
      ]}
      actions={
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      }
    >
      {/* Alerts banner */}
      {!loading && alertCount > 0 && (
        <Panel title={`${alertCount} ${alertCount !== 1 ? "products need" : "product needs"} action`} sub="Click a label to show only those products." className="mb-4">
          <div className="flex flex-wrap gap-2">
            {cogsAlerts > 0 && (
              <button type="button" onClick={() => setFilterAlerts("cogs")}>
                <Badge tone="red">
                  {summary?.cogs_above_32 ?? 0} above 32% · {summary?.cogs_below_28 ?? 0} below 28%: review pricing
                </Badge>
              </button>
            )}
            {priceAlerts > 0 && (
              <button type="button" onClick={() => setFilterAlerts("price")}>
                <Badge tone="amber">
                  {priceAlerts} price mismatch{priceAlerts !== 1 ? "es" : ""}: ask the supplier
                </Badge>
              </button>
            )}
            {negotiateAlerts > 0 && (
              <button type="button" onClick={() => setFilterAlerts("negotiate")}>
                <Badge tone="blue">
                  {negotiateAlerts} product{negotiateAlerts !== 1 ? "s" : ""}: ask for a volume discount
                </Badge>
              </button>
            )}
          </div>
        </Panel>
      )}

      {/* Filters */}
      <FilterBar
        right={
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            {filtered.length} products
          </span>
        }
      >
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
            { value: "negotiate", label: "Volume discount" },
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
      </FilterBar>

      {error && <Notice tone="error">Couldn&apos;t load supplier costs: {error}.</Notice>}

      {loading && products.length === 0 && <Loading>Loading supplier costs from ShipGoods…</Loading>}

      {/* Product cost table */}
      {!loading && filtered.length > 0 && (
        <Panel pad={false}>
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Product</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Store</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Qty (30d)</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Sale price</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Avg cost</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>
                  COGS%
                  <span className="block text-[8px] font-normal normal-case tracking-normal" style={{ color: "var(--text-dim)" }}>target 28–32%</span>
                </th>
                <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}>Status</th>
                <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}>Action</th>
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
                    style={ROW_BORDER}
                    onClick={() => setExpanded(isExpanded ? null : key)}>
                    <td className={TD}>
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
                            <div className="mt-1 px-2 py-1 rounded" style={{ background: "rgba(239,68,68,0.08)", color: "var(--red)" }}>
                              {p.cogs_alert}
                            </div>
                          )}
                          {p.cogs_action && (
                            <div className="mt-1 px-2 py-1 rounded" style={{ background: "rgba(99,102,241,0.08)", color: "var(--accent)" }}>
                              Next step: {p.cogs_action}
                            </div>
                          )}
                          {p.price_alert && (
                            <div className="mt-1 px-2 py-1 rounded" style={{ background: "rgba(250,204,21,0.08)", color: "var(--orange)" }}>
                              {p.price_alert}
                            </div>
                          )}
                          {p.negotiation_alert && (
                            <div className="mt-1 px-2 py-1 rounded" style={{ background: "rgba(99,102,241,0.08)", color: "var(--accent)" }}>
                              {p.negotiation_alert}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{p.store}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{p.total_qty}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>
                      {p.sale_price > 0 ? usd(p.sale_price) : "—"}
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{usd(p.avg_cost)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: cogsColor(p.cogs_pct) }}>
                      {p.cogs_pct !== null ? `${p.cogs_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className={`${TD} text-center`}>
                      {badge && (
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      )}
                      {!badge && <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>—</span>}
                    </td>
                    <td className={`${TD} text-center`}>
                      <div className="flex items-center justify-center gap-1">
                        {p.cogs_alert && (
                          <Badge tone="red" title={p.cogs_action || p.cogs_alert}>COGS</Badge>
                        )}
                        {p.price_alert && (
                          <Badge tone="amber" title={p.price_alert}>Price</Badge>
                        )}
                        {p.negotiation_alert && (
                          <Badge tone="blue" title={p.negotiation_alert}>Volume</Badge>
                        )}
                        {!hasAnyAlert && <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>—</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {!loading && products.length > 0 && filtered.length === 0 && (
        <EmptyState title="No products match these filters">Set Show to &quot;All products&quot; or clear the store filter.</EmptyState>
      )}

      {!loading && products.length === 0 && !error && (
        <EmptyState title="No supplier cost data from ShipGoods">
          Check that SHIPGOODS_TOKEN is set in the Vercel environment variables.
        </EmptyState>
      )}
    </PageShell>
  )
}
