"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"

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
  quote_price: number | null
  orders: number
  last_order_date: string
  cogs_pct: number | null
  price_alert: string | null
  negotiation_alert: string | null
}

interface Summary {
  products_tracked: number
  products_with_alerts: number
  active_stores: number
  avg_cogs_unit: number
}

export default function SupplierCostsPage() {
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filterStore, setFilterStore] = useState("all")
  const [filterAlerts, setFilterAlerts] = useState("all")
  const [sortBy, setSortBy] = useState<"qty" | "cogs" | "variance">("qty")
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
      if (filterStore !== "all" && p.store !== filterStore) return false
      if (filterAlerts === "price" && !p.price_alert) return false
      if (filterAlerts === "negotiate" && !p.negotiation_alert) return false
      if (filterAlerts === "any" && !p.price_alert && !p.negotiation_alert)
        return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === "qty") return b.total_qty - a.total_qty
      if (sortBy === "cogs") return b.total_cogs - a.total_cogs
      return b.cost_variance - a.cost_variance
    })

  const usd = (n: number) => `$${n.toFixed(2)}`
  const alertCount = products.filter(
    (p) => p.price_alert || p.negotiation_alert
  ).length
  const priceAlerts = products.filter((p) => p.price_alert).length
  const negotiateAlerts = products.filter((p) => p.negotiation_alert).length

  return (
    <PageShell
      title="Supplier Costs"
      breadcrumb="Finance → Supplier Costs"
      description="Per-product COGS from ShipGoods. Compare quoted vs charged prices, spot variance, and get volume negotiation reminders."
      stats={[
        {
          label: "Products tracked",
          value: summary ? String(summary.products_tracked) : "—",
        },
        {
          label: "Avg COGS/unit",
          value: summary ? usd(summary.avg_cogs_unit) : "—",
        },
        {
          label: "Price mismatches",
          value: loading ? "—" : String(priceAlerts),
        },
        {
          label: "Negotiate volume",
          value: loading ? "—" : String(negotiateAlerts),
        },
      ]}
    >
      {/* Alerts banner */}
      {!loading && alertCount > 0 && (
        <div
          className="glass rounded-xl p-3 mb-4"
          style={{ borderLeft: "3px solid #facc15" }}
        >
          <div
            className="text-[11px] font-semibold mb-1"
            style={{ color: "var(--text)" }}
          >
            {alertCount} action{alertCount !== 1 ? "s" : ""} needed
          </div>
          <div
            className="flex flex-wrap gap-3 text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            {priceAlerts > 0 && (
              <span
                className="px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(239,68,68,0.12)",
                  color: "#f87171",
                }}
              >
                {priceAlerts} price mismatch
                {priceAlerts !== 1 ? "es" : ""} — ask supplier
              </span>
            )}
            {negotiateAlerts > 0 && (
              <span
                className="px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(99,102,241,0.12)",
                  color: "#818cf8",
                }}
              >
                {negotiateAlerts} product
                {negotiateAlerts !== 1 ? "s" : ""} — request volume
                discount
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          className="bg-transparent border rounded-lg px-3 py-1.5 text-[11px]"
          style={{
            borderColor: "rgba(255,255,255,0.08)",
            color: "var(--text)",
          }}
          value={filterStore}
          onChange={(e) => setFilterStore(e.target.value)}
        >
          <option value="all">All stores</option>
          {stores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="bg-transparent border rounded-lg px-3 py-1.5 text-[11px]"
          style={{
            borderColor: "rgba(255,255,255,0.08)",
            color: "var(--text)",
          }}
          value={filterAlerts}
          onChange={(e) => setFilterAlerts(e.target.value)}
        >
          <option value="all">All products</option>
          <option value="any">With alerts</option>
          <option value="price">Price mismatches</option>
          <option value="negotiate">Volume negotiate</option>
        </select>
        <select
          className="bg-transparent border rounded-lg px-3 py-1.5 text-[11px]"
          style={{
            borderColor: "rgba(255,255,255,0.08)",
            color: "var(--text)",
          }}
          value={sortBy}
          onChange={(e) =>
            setSortBy(e.target.value as "qty" | "cogs" | "variance")
          }
        >
          <option value="qty">Sort: Quantity</option>
          <option value="cogs">Sort: Total COGS</option>
          <option value="variance">Sort: Price variance</option>
        </select>
        <span
          className="text-[10px] ml-auto"
          style={{ color: "var(--text-dim)" }}
        >
          {filtered.length} products
        </span>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "var(--text-muted)",
          }}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div
          className="glass rounded-xl p-4 mb-4 text-[11px]"
          style={{ color: "#f87171" }}
        >
          {error}
        </div>
      )}

      {loading && products.length === 0 && (
        <div className="glass rounded-xl p-8 text-center">
          <div
            className="text-[11px]"
            style={{ color: "var(--text-dim)" }}
          >
            Loading supplier cost data from ShipGoods...
          </div>
        </div>
      )}

      {/* Product cost table */}
      {!loading && filtered.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <th
                  className="text-left px-4 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Product
                </th>
                <th
                  className="text-left px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Store
                </th>
                <th
                  className="text-right px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Qty (30d)
                </th>
                <th
                  className="text-right px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Avg cost
                </th>
                <th
                  className="text-right px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Quote
                </th>
                <th
                  className="text-right px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Variance
                </th>
                <th
                  className="text-right px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  COGS%
                </th>
                <th
                  className="text-center px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Alerts
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const key = `${p.title}::${p.variant_title}::${p.store}`
                const isExpanded = expanded === key
                const hasPriceMismatch =
                  p.quote_price !== null &&
                  Math.abs(p.avg_cost - p.quote_price) > 0.5
                return (
                  <tr
                    key={i}
                    className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                    style={{
                      borderBottom:
                        "1px solid rgba(255,255,255,0.04)",
                    }}
                    onClick={() =>
                      setExpanded(isExpanded ? null : key)
                    }
                  >
                    <td className="px-4 py-2.5">
                      <div
                        className="font-medium truncate max-w-[220px]"
                        style={{ color: "var(--text)" }}
                      >
                        {p.title}
                      </div>
                      {p.variant_title && (
                        <div
                          className="text-[9px]"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {p.variant_title}
                        </div>
                      )}
                      {isExpanded && (
                        <div
                          className="mt-2 p-2 rounded-lg text-[10px] space-y-1"
                          style={{
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div
                            className="flex gap-4"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <span>
                              Orders: {p.orders}
                            </span>
                            <span>
                              Total COGS: {usd(p.total_cogs)}
                            </span>
                            <span>
                              Total sold: {usd(p.total_sold)}
                            </span>
                          </div>
                          <div
                            className="flex gap-4"
                            style={{ color: "var(--text-dim)" }}
                          >
                            <span>
                              Cost range: {usd(p.min_cost)} –{" "}
                              {usd(p.max_cost)}
                            </span>
                            <span>
                              Last order: {p.last_order_date}
                            </span>
                          </div>
                          {p.price_alert && (
                            <div
                              className="mt-1 px-2 py-1 rounded"
                              style={{
                                background:
                                  "rgba(239,68,68,0.08)",
                                color: "#f87171",
                              }}
                            >
                              {p.price_alert}
                            </div>
                          )}
                          {p.negotiation_alert && (
                            <div
                              className="mt-1 px-2 py-1 rounded"
                              style={{
                                background:
                                  "rgba(99,102,241,0.08)",
                                color: "#818cf8",
                              }}
                            >
                              {p.negotiation_alert}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td
                      className="px-3 py-2.5 text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {p.store}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-mono"
                      style={{ color: "var(--text)" }}
                    >
                      {p.total_qty}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-mono"
                      style={{
                        color: hasPriceMismatch
                          ? "#f87171"
                          : "var(--text)",
                      }}
                    >
                      {usd(p.avg_cost)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-mono"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {p.quote_price !== null
                        ? usd(p.quote_price)
                        : "—"}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-mono"
                      style={{
                        color:
                          p.cost_variance > 1
                            ? "#facc15"
                            : "var(--text-dim)",
                      }}
                    >
                      {p.cost_variance > 0
                        ? `±${usd(p.cost_variance)}`
                        : "—"}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-mono"
                      style={{
                        color:
                          (p.cogs_pct ?? 0) > 40
                            ? "#f87171"
                            : (p.cogs_pct ?? 0) > 30
                              ? "#facc15"
                              : "var(--text)",
                      }}
                    >
                      {p.cogs_pct !== null
                        ? `${p.cogs_pct}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {p.price_alert && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[8px] font-medium"
                            style={{
                              background:
                                "rgba(239,68,68,0.12)",
                              color: "#f87171",
                            }}
                            title={p.price_alert}
                          >
                            Price
                          </span>
                        )}
                        {p.negotiation_alert && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[8px] font-medium"
                            style={{
                              background:
                                "rgba(99,102,241,0.12)",
                              color: "#818cf8",
                            }}
                            title={p.negotiation_alert}
                          >
                            Volume
                          </span>
                        )}
                        {!p.price_alert &&
                          !p.negotiation_alert && (
                            <span
                              className="text-[9px]"
                              style={{
                                color: "var(--text-dim)",
                              }}
                            >
                              —
                            </span>
                          )}
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
          <div
            className="text-[13px] font-medium mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            No supplier cost data
          </div>
          <div
            className="text-[11px]"
            style={{ color: "var(--text-dim)" }}
          >
            Check that SHIPGOODS_TOKEN is set in Vercel environment
            variables.
          </div>
        </div>
      )}
    </PageShell>
  )
}
