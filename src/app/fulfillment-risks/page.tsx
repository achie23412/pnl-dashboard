"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterBar } from "@/components/PillSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"

interface RiskProduct {
  name: string
  variant: string
  stock: number
  unit_price: number
  countries: string[]
  updated_at: string
  risk: "high" | "medium" | "low"
  reasons: string[]
}

interface Summary {
  total_orders: number
  address_errors: number
  waiting_process: number
  trace_added: number
  quote_pending: number
  balance_usd: number
  low_stock_products: number
  carriers: Record<string, number>
  stores: Record<string, { total: number; issues: number; shipped: number }>
}

const RISK_BADGE: Record<string, { tone: "red" | "amber" | "green" }> = {
  high: { tone: "red" },
  medium: { tone: "amber" },
  low: { tone: "green" },
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export default function FulfillmentRisksPage() {
  const [products, setProducts] = useState<RiskProduct[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "medium">("all")

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/supply-chain")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setProducts(data.products_at_risk || [])
      setSummary(data.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = products.filter((p) => {
    if (riskFilter === "all") return true
    return p.risk === riskFilter
  })

  const highCount = products.filter((p) => p.risk === "high").length
  const medCount = products.filter((p) => p.risk === "medium").length
  const totalStores = summary ? Object.keys(summary.stores).length : 0
  const issueRate = summary && summary.total_orders > 0
    ? ((summary.address_errors + summary.waiting_process) / summary.total_orders * 100).toFixed(1)
    : "0"

  return (
    <PageShell
      title="Fulfillment Risks"
      breadcrumb="Supply Chain → Fulfillment Risks"
      description="Products and stores at risk: low stock, address errors, stuck orders, stale products. Data from ShipGoods."
      stats={[
        { label: "High risk products", value: loading ? "—" : String(highCount) },
        { label: "Medium risk", value: loading ? "—" : String(medCount) },
        { label: "Issue rate (30d)", value: loading ? "—" : `${issueRate}%` },
        { label: "ShipGoods balance", value: summary ? `$${summary.balance_usd.toFixed(2)}` : "—" },
      ]}
      actions={
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      }
    >
      {error && <Notice tone="error">Couldn&apos;t load risk data: {error}.</Notice>}
      {loading && <Loading>Loading fulfillment risk data…</Loading>}

      {/* Risk overview cards */}
      {summary && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Address errors",
              value: summary.address_errors,
              total: summary.total_orders,
              color: summary.address_errors > 0 ? "var(--red)" : "var(--green)",
            },
            {
              label: "Stuck orders",
              value: summary.waiting_process,
              total: summary.total_orders,
              color: summary.waiting_process > 3 ? "var(--red)" : summary.waiting_process > 0 ? "var(--orange)" : "var(--green)",
            },
            {
              label: "Quote pending",
              value: summary.quote_pending,
              total: summary.total_orders,
              color: summary.quote_pending > 0 ? "var(--orange)" : "var(--green)",
            },
            {
              label: "Active stores",
              value: totalStores,
              total: 5,
              color: "var(--text)",
            },
          ].map((card) => (
            <div key={card.label} className="glass rounded-xl p-3">
              <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>
                {card.label}
              </div>
              <div className="text-[18px] font-bold tabular-nums" style={{ color: card.color }}>
                {card.value}
              </div>
              <div className="text-[9px] tabular-nums" style={{ color: "var(--text-dim)" }}>
                of {card.total} {card.label === "Active stores" ? "stores" : "orders"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Store risk summary */}
      {summary && Object.keys(summary.stores).length > 0 && (
        <Panel title="Store fulfillment health" pad={false}>
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Store</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Orders</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Issues</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Shipped</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Issue rate</th>
                <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}>Health</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.stores)
                .sort(([, a], [, b]) => (b.issues / (b.total || 1)) - (a.issues / (a.total || 1)))
                .map(([store, s]) => {
                  const rate = s.total > 0 ? s.issues / s.total : 0
                  const health = rate > 0.1 ? "At risk" : rate > 0 ? "Watch" : "Healthy"
                  const tone = rate > 0.1 ? "red" : rate > 0 ? "amber" : "green"
                  return (
                    <tr key={store} style={ROW_BORDER}>
                      <td className={`${TD} font-medium`} style={{ color: "var(--text)" }}>{store}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{s.total}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: s.issues > 0 ? "var(--red)" : "var(--text-muted)" }}>
                        {s.issues}
                      </td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--green)" }}>{s.shipped}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: rate > 0.1 ? "var(--red)" : "var(--text-muted)" }}>
                        {s.total > 0 ? `${(rate * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className={`${TD} text-center`}>
                        <Badge tone={tone as "red" | "amber" | "green"}>{health}</Badge>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Product risk table */}
      {!loading && products.length > 0 && (
        <>
          <FilterBar
            right={
              <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                {filtered.length} products at risk
              </span>
            }
          >
            <div className="flex gap-1">
              {(["all", "high", "medium"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRiskFilter(r)}
                  className="px-2 py-0.5 rounded text-[10px] transition-colors"
                  style={{
                    background: riskFilter === r ? "rgba(255,255,255,0.1)" : "transparent",
                    color: riskFilter === r ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  {r === "all" ? "All" : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </FilterBar>

          <Panel title="Products at risk" pad={false}>
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}>Risk</th>
                  <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Product</th>
                  <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Variant</th>
                  <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Stock</th>
                  <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Unit price</th>
                  <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Countries</th>
                  <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Reasons</th>
                  <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((p, i) => (
                  <tr key={i} style={ROW_BORDER} className="hover:bg-white/[0.02] transition-colors">
                    <td className={`${TD} text-center`}>
                      <Badge tone={RISK_BADGE[p.risk].tone}>{p.risk}</Badge>
                    </td>
                    <td className={TD}>
                      <div className="max-w-[200px] truncate" style={{ color: "var(--text)" }}>{p.name}</div>
                    </td>
                    <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>
                      <div className="max-w-[120px] truncate">{p.variant || "—"}</div>
                    </td>
                    <td
                      className={`${TD} text-right tabular-nums font-medium`}
                      style={{ color: p.stock <= 0 ? "var(--red)" : p.stock <= 5 ? "var(--orange)" : "var(--text)" }}
                    >
                      {p.stock}
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>
                      ${p.unit_price.toFixed(2)}
                    </td>
                    <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>
                      {p.countries.join(", ") || "—"}
                    </td>
                    <td className={TD}>
                      <div className="text-[10px] space-y-0.5">
                        {p.reasons.map((r, j) => (
                          <div key={j} style={{ color: p.risk === "high" ? "var(--red)" : "var(--orange)" }}>{r}</div>
                        ))}
                      </div>
                    </td>
                    <td className={`${TD} tabular-nums text-[10px]`} style={{ color: "var(--text-dim)" }}>
                      {fmtDay(p.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 50 && (
              <div className="text-center py-2 text-[10px]" style={{ color: "var(--text-dim)" }}>
                Showing 50 of {filtered.length} products
              </div>
            )}
          </Panel>
        </>
      )}

      {!loading && products.length === 0 && !error && (
        <EmptyState title="No fulfillment risks">All ShipGoods products have healthy stock levels and no issues.</EmptyState>
      )}

      {/* Balance warning */}
      {summary && summary.balance_usd < -500 && (
        <Notice tone="warning">
          ShipGoods balance is ${summary.balance_usd.toFixed(2)} USD. Consider topping up to avoid fulfillment delays.
        </Notice>
      )}

      <div className="text-[9px] space-y-0.5" style={{ color: "var(--text-dim)" }}>
        <div>• Risk is based on stock levels and data freshness from ShipGoods products endpoint.</div>
        <div>• High risk: out of stock or &le;5 units. Medium risk: &le;20 units or not updated in 30+ days.</div>
        <div>• Issue rate = (address errors + stuck orders) / total orders in the last 30 days.</div>
      </div>
    </PageShell>
  )
}
