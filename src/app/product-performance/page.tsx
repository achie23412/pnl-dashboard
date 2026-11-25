"use client"
import { useEffect, useState, useMemo } from "react"
import { STORES, STORE_COLORS } from "@/lib/constants"
import type { StoreName } from "@/lib/constants"

interface CatalogProduct {
  product_name: string
  store: string
  cogs_usd: number | null
  retail_price: string
  cog_pct: string
  category: string
  units_sold: number
  sales_revenue: number
  cogs_source: "shipgoods" | "sheet" | "none"
}

interface CatalogResponse {
  products: CatalogProduct[]
  total_products: number
  products_with_sales: number
  products_with_cogs: number
  total_units_sold: number
  total_revenue: number
  sales_sources?: Record<string, string>
  errors?: string[]
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

type SortKey = "units" | "revenue" | "profit" | "margin" | "cogs"
type SortDir = "asc" | "desc"

export default function ProductPerformancePage() {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [store, setStore] = useState<StoreName>("Overall")
  const [sortKey, setSortKey] = useState<SortKey>("revenue")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [dataErrors, setDataErrors] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [salesSources, setSalesSources] = useState<Record<string, string>>({})
  const [summary, setSummary] = useState({ total: 0, withSales: 0, withCogs: 0, totalUnits: 0, totalRevenue: 0 })

  useEffect(() => {
    setLoading(true)
    fetch("/api/product-catalog?store=all")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Product API returned HTTP ${r.status}`)
        return r.json()
      })
      .then((data: CatalogResponse) => {
        setProducts(data.products || [])
        setDataErrors(data.errors || [])
        setSalesSources(data.sales_sources || {})
        setSummary({
          total: data.total_products,
          withSales: data.products_with_sales,
          withCogs: data.products_with_cogs,
          totalUnits: data.total_units_sold,
          totalRevenue: data.total_revenue,
        })
        setLoading(false)
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    let list = store === "Overall" ? products : products.filter((p) => p.store === store)
    list = list.filter((p) => p.units_sold > 0)

    return [...list].sort((a, b) => {
      const profitA = a.cogs_usd != null ? a.sales_revenue - a.cogs_usd * a.units_sold : a.sales_revenue
      const profitB = b.cogs_usd != null ? b.sales_revenue - b.cogs_usd * b.units_sold : b.sales_revenue
      const marginA = a.sales_revenue > 0 && a.cogs_usd != null ? (profitA / a.sales_revenue) * 100 : 0
      const marginB = b.sales_revenue > 0 && b.cogs_usd != null ? (profitB / b.sales_revenue) * 100 : 0

      let valA: number, valB: number
      switch (sortKey) {
        case "units": valA = a.units_sold; valB = b.units_sold; break
        case "revenue": valA = a.sales_revenue; valB = b.sales_revenue; break
        case "profit": valA = profitA; valB = profitB; break
        case "margin": valA = marginA; valB = marginB; break
        case "cogs": valA = a.cogs_usd || 0; valB = b.cogs_usd || 0; break
        default: valA = a.sales_revenue; valB = b.sales_revenue
      }
      return sortDir === "desc" ? valB - valA : valA - valB
    })
  }, [products, store, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    else { setSortKey(key); setSortDir("desc") }
  }

  const SortHeader = ({ label, k, align = "right" }: { label: string; k: SortKey; align?: string }) => (
    <th
      className={`${align === "left" ? "text-left" : "text-right"} px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider cursor-pointer select-none`}
      style={{ color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      onClick={() => toggleSort(k)}
    >
      {label} {sortKey === k ? (sortDir === "desc" ? "▾" : "▴") : ""}
    </th>
  )

  return (
    <div className="p-6 min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>Front End → Product Performance</div>
      <h1 className="text-[20px] font-bold mb-1" style={{ color: "var(--text)" }}>Product Performance</h1>
      <p className="text-[12px] mb-5 max-w-3xl" style={{ color: "var(--text-muted)" }}>
        Every product ranked by contribution margin. Last 30 days.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { label: "Products", value: summary.total.toString() },
          { label: "With sales", value: summary.withSales.toString() },
          { label: "With COGS", value: summary.withCogs.toString() },
          { label: "Units sold", value: fmt(summary.totalUnits) },
          { label: "Revenue", value: `$${fmt(summary.totalRevenue)}`, color: "var(--green)" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>{s.label}</div>
            <div className="text-[18px] font-bold" style={{ color: s.color || "var(--text)" }}>{loading ? "—" : s.value}</div>
          </div>
        ))}
      </div>

      {!loading && (loadError || dataErrors.length > 0) && (
        <div className="rounded-xl px-4 py-2.5 mb-4" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--orange)" }}>Some product data could not be loaded</div>
          {loadError && <div className="text-[10px]" style={{ color: "var(--orange)" }}>{loadError}</div>}
          {dataErrors.map((e) => (
            <div key={e} className="text-[10px]" style={{ color: "var(--orange)" }}>{e}</div>
          ))}
        </div>
      )}

      {/* Store filter */}
      <div className="glass rounded-xl p-1.5 inline-flex gap-1 overflow-x-auto mb-5">
        {STORES.map((s) => {
          const isActive = s === store
          const color = s === "Overall" ? "#6366f1" : STORE_COLORS[s] || "#666"
          return (
            <button
              key={s}
              onClick={() => setStore(s)}
              className="relative px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all"
              style={{
                background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                color: isActive ? "#fff" : "var(--text-dim)",
              }}
            >
              {isActive && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-[2px] rounded-full" style={{ background: color }} />}
              <div className="flex items-center gap-1.5">
                {s !== "Overall" && <div className="w-1.5 h-1.5 rounded-full" style={{ background: color, opacity: isActive ? 1 : 0.4 }} />}
                {s}
              </div>
            </button>
          )
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 rounded-full animate-spin" style={{ border: "2px solid rgba(255,255,255,0.06)", borderTopColor: "var(--accent)" }} />
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Loading products</span>
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: "linear-gradient(90deg, rgba(99,102,241,0.5), transparent 60%)" }} />
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Product</th>
                  <th className="text-left px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Store</th>
                  <SortHeader label="Units" k="units" />
                  <SortHeader label="Revenue" k="revenue" />
                  <SortHeader label="COGS/unit" k="cogs" />
                  <SortHeader label="Profit" k="profit" />
                  <SortHeader label="Margin" k="margin" />
                  <th className="text-right px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-[11px]" style={{ color: "var(--text-dim)" }}>No products with sales in this period</td></tr>
                ) : filtered.map((p, i) => {
                  const totalCogs = p.cogs_usd != null ? p.cogs_usd * p.units_sold : null
                  const profit = totalCogs != null ? p.sales_revenue - totalCogs : null
                  const margin = profit != null && p.sales_revenue > 0 ? (profit / p.sales_revenue) * 100 : null
                  const profitColor = profit != null ? (profit >= 0 ? "var(--green)" : "var(--red)") : "var(--text-dim)"
                  const marginColor = margin != null ? (margin >= 30 ? "var(--green)" : margin >= 0 ? "var(--orange)" : "var(--red)") : "var(--text-dim)"
                  const sourceColor = p.cogs_source === "shipgoods" ? "var(--green)" : p.cogs_source === "sheet" ? "var(--orange)" : "var(--text-dim)"

                  return (
                    <tr
                      key={`${p.product_name}-${p.store}-${i}`}
                      className="transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                      style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}
                    >
                      <td className="px-3 py-2 max-w-[200px]">
                        <span className="text-[11px] font-medium truncate block" style={{ color: "var(--text)" }}>{p.product_name}</span>
                        {p.category && <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.category}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STORE_COLORS[p.store] || "#666" }} />
                          {p.store}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{p.units_sold}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: "var(--text)" }}>${fmt(p.sales_revenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: p.cogs_usd != null ? "var(--orange)" : "var(--text-dim)" }}>
                        {p.cogs_usd != null ? `$${p.cogs_usd.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: profitColor }}>
                        {profit != null ? `${profit < 0 ? "-" : ""}$${fmt(Math.abs(profit))}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: marginColor }}>
                        {margin != null ? `${margin.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-[9px] font-medium" style={{ color: sourceColor }}>
                          {p.cogs_source === "shipgoods" ? "SG" : p.cogs_source === "sheet" ? "Sheet" : "None"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[9px]" style={{ color: "var(--text-dim)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {filtered.length} products · Revenue and COGS in original store currency (not EUR-converted) · SG = ShipGoods actual, Sheet = launch sheet
            {Object.keys(salesSources).length > 0 && (
              <> · Sales from: {Object.entries(salesSources).map(([s, src]) => `${s} ${src === "shopify" ? "Shopify" : src === "shipgoods" ? "ShipGoods (fulfilled orders)" : "none"}`).join(", ")}</>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
