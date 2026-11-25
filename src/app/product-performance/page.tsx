"use client"
import { FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { PageShell } from "@/components/PageShell"
import { Panel, Badge, Notice, Loading, TH, TD, ROW_BORDER } from "@/components/ui"
import { useEffect, useState, useMemo } from "react"
import { STORES, STORE_COLORS } from "@/lib/constants"
import { STORE_CURRENCY } from "@/lib/currency"
import { DatePicker } from "@/components/DatePicker"
import { FixBanner } from "@/components/FixBanner"
import { getDateRange } from "@/lib/date-range"
import { ProductLink } from "@/components/ProductLink"

interface CatalogProduct {
  product_name: string
  store: string
  cogs_usd: number | null
  retail_price: string
  cog_pct: string
  category: string
  units_sold: number
  sales_revenue: number
  cogs_source: "shipgoods" | "sheet" | "quote" | "none"
  ad_spend: number | null
  roas: number | null
  be_roas: number | null
  product_ids?: string[]
}

interface StoreSummary {
  store: string
  revenue: number
  ad_spend: number
  roas: number | null
  be_roas: number | null
  product_level_spend: boolean
}

interface CatalogResponse {
  products: CatalogProduct[]
  stores?: StoreSummary[]
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

const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" }
const sym = (store: string) => CURRENCY_SYMBOL[STORE_CURRENCY[store] || "EUR"] || ""
const fmtRoas = (r: number | null) => (r == null ? "—" : `${r.toFixed(2)}x`)
const roasColor = (roas: number | null, be: number | null) =>
  roas == null ? "var(--text-dim)" : be == null ? "var(--text)" : roas >= be ? "var(--green)" : "var(--red)"

type SortKey = "units" | "revenue" | "profit" | "margin" | "cogs" | "spend" | "roas" | "be"
type SortDir = "asc" | "desc"

export default function ProductPerformancePage() {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [store, setStore] = useState<FilterValue>(EMPTY_FILTER)
  const [sortKey, setSortKey] = useState<SortKey>("revenue")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [dataErrors, setDataErrors] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [salesSources, setSalesSources] = useState<Record<string, string>>({})
  const [storeSummaries, setStoreSummaries] = useState<StoreSummary[]>([])
  const [preset, setPreset] = useState("last_30d")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [dateFrom, dateTo] = getDateRange(preset, customFrom, customTo)
  const [summary, setSummary] = useState({ total: 0, withSales: 0, withCogs: 0, totalUnits: 0, totalRevenue: 0 })

  useEffect(() => {
    let cancelled = false
    const cacheKey = `product-performance:v1:${dateFrom}:${dateTo}`
    const apply = (data: CatalogResponse) => {
      setProducts(data.products || [])
      setDataErrors(data.errors || [])
      setSalesSources(data.sales_sources || {})
      setStoreSummaries(data.stores || [])
      setSummary({
        total: data.total_products,
        withSales: data.products_with_sales,
        withCogs: data.products_with_cogs,
        totalUnits: data.total_units_sold,
        totalRevenue: data.total_revenue,
      })
    }

    // Show the last result for this date range immediately (if any), then refresh.
    let hadCache = false
    try {
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        apply(JSON.parse(raw) as CatalogResponse)
        hadCache = true
      }
    } catch {
      // storage unavailable or corrupt: just load normally
    }
    setLoading(!hadCache)
    setRefreshing(hadCache)
    setLoadError(null)

    fetch(`/api/product-catalog?store=all&from=${dateFrom}&to=${dateTo}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Product API returned HTTP ${r.status}`)
        return r.json()
      })
      .then((data: CatalogResponse) => {
        if (cancelled) return
        apply(data)
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data))
        } catch {
          // quota exceeded etc.: caching is optional
        }
        setLoading(false)
        setRefreshing(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : String(e))
        setLoading(false)
        setRefreshing(false)
      })
    return () => {
      cancelled = true
    }
  }, [dateFrom, dateTo])

  const filtered = useMemo(() => {
    let list = products.filter((p) => passes(store, p.store))
    // products with sales, plus products with ad spend but no sales (ROAS 0)
    list = list.filter((p) => p.units_sold > 0 || (p.ad_spend || 0) > 0)

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
        case "spend": valA = a.ad_spend ?? -1; valB = b.ad_spend ?? -1; break
        case "roas": valA = a.roas ?? -1; valB = b.roas ?? -1; break
        case "be": valA = a.be_roas ?? -1; valB = b.be_roas ?? -1; break
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
      className={`${TH} ${align === "left" ? "text-left" : "text-right"} cursor-pointer select-none`}
      style={{ color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      onClick={() => toggleSort(k)}
    >
      {label} {sortKey === k ? (sortDir === "desc" ? "▾" : "▴") : ""}
    </th>
  )

  const thStyle = { color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }

  return (
    <PageShell
      title="Product Performance"
      breadcrumb="Front End → Product Performance"
      description={`Every product with its ROAS against its breakeven ROAS. ${dateFrom} → ${dateTo}.`}
      stats={[
        { label: "Products", value: loading ? "—" : summary.total.toString() },
        { label: "With sales", value: loading ? "—" : summary.withSales.toString() },
        { label: "With COGS", value: loading ? "—" : summary.withCogs.toString() },
        { label: "Units sold", value: loading ? "—" : fmt(summary.totalUnits) },
        { label: "Product revenue (mixed currencies)", value: loading ? "—" : fmt(summary.totalRevenue), color: "var(--green)" },
      ]}
      actions={
        <>
          {refreshing && <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>Updating…</span>}
          <DatePicker
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onChange={(p, f, t) => {
              setPreset(p)
              if (f) setCustomFrom(f)
              if (t) setCustomTo(t)
            }}
          />
        </>
      }
    >
      <FixBanner onApply={(ctx) => {
        if (ctx.store) {
          const match = STORES.find((s) => s === ctx.store)
          if (match) setStore({ mode: "include", values: [match] })
        }
        setSortKey("spend")
        setSortDir("desc")
      }} />

      {!loading && (loadError || dataErrors.length > 0) && (
        <Notice tone="warning">
          <div className="font-semibold mb-1">Some product data couldn&apos;t be loaded.</div>
          {loadError && <div className="text-[10px]">Couldn&apos;t load products: {loadError}.</div>}
          {dataErrors.map((e) => (
            <div key={e} className="text-[10px]">{e}</div>
          ))}
        </Notice>
      )}

      {/* ROAS vs breakeven per store (revenue + ad spend as on the Main Hub, all channels) */}
      {!loading && storeSummaries.length > 0 && (
        <Panel pad={false} className="mb-4" title="ROAS vs breakeven per store" sub="Revenue and ad spend from all channels, as on the Main Hub.">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr>
                  {["Store", "Revenue", "Ad spend", "ROAS", "Breakeven ROAS", "Status", "Product-level spend"].map((h, i) => (
                    <th key={h} className={`${TH} ${i === 0 ? "text-left" : "text-right"}`} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {storeSummaries
                  .filter((s) => passes(store, s.store))
                  .map((s) => {
                    const above = s.roas != null && s.be_roas != null ? s.roas >= s.be_roas : null
                    return (
                      <tr key={s.store} style={ROW_BORDER}>
                        <td className={TD}>
                          <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: "var(--text)" }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: STORE_COLORS[s.store] || "#666" }} />
                            {s.store}
                          </span>
                        </td>
                        <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{sym(s.store)}{fmt(s.revenue)}</td>
                        <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{sym(s.store)}{fmt(s.ad_spend)}</td>
                        <td className={`${TD} text-right tabular-nums font-semibold`} style={{ color: roasColor(s.roas, s.be_roas) }}>{fmtRoas(s.roas)}</td>
                        <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{fmtRoas(s.be_roas)}</td>
                        <td className={`${TD} text-right`}>
                          {above == null ? <span style={{ color: "var(--text-dim)" }}>—</span> : above ? <Badge tone="green">Above breakeven</Badge> : <Badge tone="red">Below breakeven</Badge>}
                        </td>
                        <td className={`${TD} text-right text-[10px]`} style={{ color: "var(--text-dim)" }}>{s.product_level_spend ? "Yes (Google)" : "No (Meta/TikTok: store level only)"}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Store filter */}
      <FilterBar>
        <FilterSelect
          label="Store"
          options={Array.from(new Set([...storeSummaries.map((x) => x.store), ...products.map((x) => x.store)])).map((st) => ({ value: st, count: products.filter((x) => x.store === st).length }))}
          value={store}
          onChange={setStore}
        />
      </FilterBar>

      {/* Table */}
      {loading ? (
        <Loading>Loading products…</Loading>
      ) : (
        <Panel pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr>
                  <th className={`${TH} text-left`} style={thStyle}>Product</th>
                  <th className={`${TH} text-left`} style={thStyle}>Store</th>
                  <SortHeader label="Units" k="units" />
                  <SortHeader label="Revenue" k="revenue" />
                  <SortHeader label="Ad spend" k="spend" />
                  <SortHeader label="ROAS" k="roas" />
                  <SortHeader label="BE ROAS" k="be" />
                  <SortHeader label="COGS/unit" k="cogs" />
                  <SortHeader label="Profit" k="profit" />
                  <SortHeader label="Margin" k="margin" />
                  <th className={`${TH} text-right`} style={thStyle}>Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-[11px]" style={{ color: "var(--text-dim)" }}>No products with sales or ad spend in this period. Pick a longer date range or another store.</td></tr>
                ) : filtered.map((p, i) => {
                  const totalCogs = p.cogs_usd != null ? p.cogs_usd * p.units_sold : null
                  const profit = totalCogs != null ? p.sales_revenue - totalCogs : null
                  const margin = profit != null && p.sales_revenue > 0 ? (profit / p.sales_revenue) * 100 : null
                  const profitColor = profit != null ? (profit >= 0 ? "var(--green)" : "var(--red)") : "var(--text-dim)"
                  const marginColor = margin != null ? (margin >= 30 ? "var(--green)" : margin >= 0 ? "var(--orange)" : "var(--red)") : "var(--text-dim)"

                  return (
                    <tr
                      key={`${p.product_name}-${p.store}-${i}`}
                      className="transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                      style={ROW_BORDER}
                    >
                      <td className={`${TD} max-w-[200px]`}>
                        <ProductLink store={p.store} name={p.product_name} productId={p.product_ids?.[0]} className="text-[11px] font-medium" maxWidth={200} />
                        {p.category && <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.category}</span>}
                      </td>
                      <td className={TD}>
                        <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STORE_COLORS[p.store] || "#666" }} />
                          {p.store}
                        </span>
                      </td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{p.units_sold}</td>
                      <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: "var(--text)" }}>{sym(p.store)}{fmt(p.sales_revenue)}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{p.ad_spend != null ? `${sym(p.store)}${fmt(p.ad_spend)}` : "—"}</td>
                      <td className={`${TD} text-right tabular-nums font-semibold`} style={{ color: roasColor(p.roas, p.be_roas) }}>{fmtRoas(p.roas)}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{fmtRoas(p.be_roas)}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: p.cogs_usd != null ? "var(--orange)" : "var(--text-dim)" }}>
                        {p.cogs_usd != null ? `$${p.cogs_usd.toFixed(2)}` : "—"}
                      </td>
                      <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: profitColor }}>
                        {profit != null ? `${profit < 0 ? "-" : ""}$${fmt(Math.abs(profit))}` : "—"}
                      </td>
                      <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: marginColor }}>
                        {margin != null ? `${margin.toFixed(1)}%` : "—"}
                      </td>
                      <td className={`${TD} text-right`}>
                        {p.cogs_source === "shipgoods" ? <Badge tone="green">SG</Badge> : p.cogs_source === "sheet" ? <Badge tone="amber">Sheet</Badge> : p.cogs_source === "quote" ? <Badge tone="blue">Quote</Badge> : <Badge tone="grey">None</Badge>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[9px]" style={{ color: "var(--text-dim)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {filtered.length} products · Revenue and ad spend in store currency, COGS/unit in USD · ROAS per product = Google Shopping spend (Meta/TikTok stores show — ; see the store table) · BE ROAS = 1 ÷ (1 − COGS% − transaction fee%) · Green = ROAS at or above breakeven · SG = ShipGoods actual, Sheet = launch sheet
            {Object.keys(salesSources).length > 0 && (
              <> · Sales from: {Object.entries(salesSources).map(([s, src]) => `${s} ${src === "shopify" ? "Shopify" : src === "shipgoods" ? "ShipGoods (fulfilled orders)" : "none"}`).join(", ")}</>
            )}
          </div>
        </Panel>
      )}
    </PageShell>
  )
}
