"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { PageShell } from "@/components/PageShell"
import { ProductLink } from "@/components/ProductLink"
import { Panel, Badge, Notice, Loading } from "@/components/ui"

interface Product {
  product_name: string
  store: string
  units_sold: number
  sales_revenue: number
  ad_spend: number
  roas: number | null
  be_roas: number | null
  cogs_usd: number | null
}

interface StoreSummary {
  store: string
  revenue: number
  ad_spend: number
  roas: number | null
  be_roas: number | null
}

interface SeasonPhase {
  name: string
  dates: string
  status: "active" | "upcoming" | "past"
  description: string
  action: string
}

const STORE_MARKET: Record<string, string> = {
  LUMEGLASSES: "US",
  Blinky: "NL/EU",
  "Walsh & Farley": "IE",
  "Carter & Collins": "UK",
  "Susan & Allen": "US",
}

const STORE_COLORS: Record<string, string> = {
  LUMEGLASSES: "#4E6AA7",
  Blinky: "#5B9EC7",
  "Walsh & Farley": "#4CA082",
  "Carter & Collins": "#8B6BB0",
  "Susan & Allen": "#D47B6A",
}

function getSeasonPhases(today: Date): SeasonPhase[] {
  const m = today.getMonth()
  const d = today.getDate()
  const y = today.getFullYear()

  const phases: SeasonPhase[] = [
    {
      name: "Black Friday / Cyber Monday",
      dates: `${y}-11-28 → ${y}-12-02`,
      status: m === 10 && d >= 25 ? "active" : m === 10 && d < 25 ? "upcoming" : "past",
      description: "Peak spend period. Highest CPMs, highest conversion rates.",
      action: "Max budget on winners. No new tests. Monitor hourly.",
    },
    {
      name: "Q4 peak (Dec)",
      dates: `${y}-12-01 → ${y}-12-20`,
      status: m === 11 && d <= 20 ? "active" : m < 11 ? "upcoming" : "past",
      description: "Gift-buying season. Fashion demand peaks mid-December.",
      action: "Scale winners aggressively. Push gift-angle creatives.",
    },
    {
      name: "Shipping cutoff",
      dates: `${y}-12-15 → ${y}-12-20`,
      status: m === 11 && d >= 15 && d <= 20 ? "active" : m === 11 && d < 15 ? "upcoming" : "past",
      description: "Last reliable delivery dates. IE/UK cutoff earlier than US.",
      action: "Drop budget 15–20% per day after cutoff. Switch to digital/gift cards if available.",
    },
    {
      name: "Q5 (Post-Holiday)",
      dates: `${y}-12-26 → ${y + 1}-01-15`,
      status: m === 11 && d >= 26 ? "active" : m === 0 && d <= 15 ? "active" : "upcoming",
      description: "Low CPMs, high intent buyers spending gift money + gift cards.",
      action: "Ramp back up. CPMs drop 30–50%. Test new products. New Year angle.",
    },
    {
      name: "January sale",
      dates: `${y + 1}-01-01 → ${y + 1}-01-31`,
      status: "upcoming",
      description: "Clearance buyers. Good for moving slow inventory.",
      action: "List sale products. Bundle slow movers. Keep CPA tight.",
    },
  ]

  return phases
}

function getSeasonLabel(today: Date): string {
  const m = today.getMonth()
  const d = today.getDate()
  if (m === 10 && d >= 25) return "BFCM week"
  if (m === 10) return "Pre-BFCM"
  if (m === 11 && d <= 20) return "Q4 peak"
  if (m === 11 && d <= 25) return "Shipping cutoff"
  if (m === 11) return "Q5 ramp"
  if (m === 0 && d <= 15) return "Q5"
  return `Month ${m + 1}`
}

export default function SeasonBoardPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [stores, setStores] = useState<StoreSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/product-catalog?store=all")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setProducts(data.products || [])
      setStores(data.stores || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const today = new Date()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const phases = useMemo(() => getSeasonPhases(today), [])
  const seasonLabel = getSeasonLabel(today)

  const activeStores = stores.filter(s => s.ad_spend > 0)
  const totalRevenue = stores.reduce((a, s) => a + s.revenue, 0)
  const totalSpend = stores.reduce((a, s) => a + s.ad_spend, 0)

  const topProducts = useMemo(() => {
    return [...products]
      .filter(p => p.units_sold > 0)
      .sort((a, b) => b.sales_revenue - a.sales_revenue)
      .slice(0, 10)
  }, [products])

  const risingProducts = useMemo(() => {
    return [...products]
      .filter(p => (p.roas ?? 0) > 2.5 && p.units_sold >= 3 && p.ad_spend > 20)
      .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
      .slice(0, 5)
  }, [products])

  const decliningProducts = useMemo(() => {
    return [...products]
      .filter(p => {
        if (p.ad_spend < 20) return false
        if (p.be_roas && p.roas != null && p.roas < p.be_roas && p.roas > 0) return true
        if (p.roas != null && p.roas > 0 && p.roas < 1.5 && p.units_sold <= 1) return true
        return false
      })
      .sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0))
      .slice(0, 5)
  }, [products])

  const eur = (n: number) => n < 1000
    ? `€${n.toFixed(2)}`
    : `€${(n / 1000).toFixed(1)}k`

  const storeStats = useMemo(() => {
    return activeStores.map(s => {
      const storeProducts = products.filter(p => p.store === s.store)
      const winners = storeProducts.filter(p => (p.roas ?? 0) > 2.5 && p.units_sold >= 2).length
      const losers = storeProducts.filter(p => p.be_roas !== null && p.roas != null && p.roas < p.be_roas && p.ad_spend > 20).length
      const totalProducts = storeProducts.filter(p => p.units_sold > 0).length

      let budgetAdvice = "Hold"
      let budgetTone: "amber" | "green" | "red" = "amber"
      if (s.roas && s.be_roas && s.roas > s.be_roas * 1.3) {
        budgetAdvice = "Scale"
        budgetTone = "green"
      } else if (s.roas && s.be_roas && s.roas < s.be_roas) {
        budgetAdvice = "Cut"
        budgetTone = "red"
      }

      return { ...s, winners, losers, totalProducts, budgetAdvice, budgetTone }
    })
  }, [activeStores, products])

  return (
    <PageShell
      title="Season Board"
      breadcrumb="Front End → Season Board"
      description={`Current phase: ${seasonLabel}. Budget and product decisions based on seasonal timing and store performance.`}
      stats={[
        { label: "Active stores", value: String(activeStores.length) },
        { label: "Overall ROAS", value: totalSpend > 0 ? `${(totalRevenue / totalSpend).toFixed(2)}x` : "—" },
        { label: "Top sellers", value: String(topProducts.length) },
        { label: "Phase", value: seasonLabel },
      ]}
    >
      {loading && <Loading>Loading store data…</Loading>}

      {error && <Notice tone="error">Couldn&apos;t load store data: {error}.</Notice>}

      {!loading && (
        <>
          {/* Season Timeline */}
          <Panel title="Season timeline" className="mb-4">
            <div className="space-y-2">
              {phases.map((p, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-2.5 rounded-lg transition-colors"
                  style={{
                    background: p.status === "active" ? "rgba(74,222,128,0.06)" : "transparent",
                    borderLeft: p.status === "active" ? "2px solid var(--green)" : "2px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {p.status === "active" && <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--green)" }} />}
                    {p.status === "upcoming" && <span className="inline-block w-2 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />}
                    {p.status === "past" && <span className="inline-block w-2 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium" style={{ color: p.status === "active" ? "var(--green)" : p.status === "upcoming" ? "var(--text)" : "var(--text-dim)" }}>{p.name}</span>
                      <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.dates}</span>
                      {p.status === "active" && (
                        <Badge tone="green">Now</Badge>
                      )}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)" }}>{p.description}</div>
                    <div className="text-[10px] mt-1 font-medium" style={{ color: p.status === "active" ? "var(--green)" : "var(--text-muted)" }}>{p.action}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Store Budget Board */}
          <Panel title="Store budget board" className="mb-4">
            {storeStats.length === 0 ? (
              <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>No active stores with spend.</div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {storeStats.map(s => (
                  <div key={s.store} className="flex items-center gap-4 p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <div className="flex-shrink-0 w-3 h-3 rounded-full" style={{ background: STORE_COLORS[s.store] || "#666" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium" style={{ color: "var(--text)" }}>{s.store}</span>
                        <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>{STORE_MARKET[s.store]}</span>
                      </div>
                      <div className="flex gap-4 mt-1 text-[10px]" style={{ color: "var(--text-dim)" }}>
                        <span>Revenue: {eur(s.revenue)}</span>
                        <span>Spend: {eur(s.ad_spend)}</span>
                        <span>ROAS: {s.roas ? `${s.roas.toFixed(2)}x` : "—"}</span>
                        <span>Break-even: {s.be_roas ? `${s.be_roas.toFixed(2)}x` : "—"}</span>
                        <span>{s.winners} winners / {s.losers} losers / {s.totalProducts} selling</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <Badge tone={s.budgetTone}>{s.budgetAdvice}</Badge>
                      <div className="text-[9px] mt-0.5" style={{ color: "var(--text-dim)" }}>
                        {s.budgetAdvice === "Scale" ? "ROAS above 1.3× break-even" : s.budgetAdvice === "Cut" ? "ROAS below break-even" : "Within range"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Product Momentum */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Rising */}
            <Panel title="Rising products" right={<Badge tone="green">Scale candidates</Badge>}>
              {risingProducts.length === 0 ? (
                <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>No products with ROAS above 2.5, 3+ sales and €20+ spend yet.</div>
              ) : (
                <div className="space-y-2">
                  {risingProducts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div>
                        <div className="text-[10px]"><ProductLink store={p.store} name={p.product_name} className="font-medium" maxWidth={200} /></div>
                        <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.store} · {p.units_sold} sold</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] tabular-nums font-medium" style={{ color: "var(--green)" }}>{(p.roas ?? 0).toFixed(2)}x</div>
                        <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{eur(p.ad_spend)} spent</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Declining */}
            <Panel title="Declining products" right={<Badge tone="red">Phase-out candidates</Badge>}>
              {decliningProducts.length === 0 ? (
                <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>No products below break-even with €20+ spend.</div>
              ) : (
                <div className="space-y-2">
                  {decliningProducts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div>
                        <div className="text-[10px]"><ProductLink store={p.store} name={p.product_name} className="font-medium" maxWidth={200} /></div>
                        <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.store} · {p.units_sold} sold</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] tabular-nums font-medium" style={{ color: "var(--red)" }}>{(p.roas ?? 0).toFixed(2)}x</div>
                        <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>Break-even: {p.be_roas?.toFixed(2) || "—"}x</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* Top Sellers */}
          <Panel title="Top sellers this period">
            {topProducts.length === 0 ? (
              <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>No sales in this period yet.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {topProducts.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <span className="text-[10px] tabular-nums w-5 text-right" style={{ color: "var(--text-dim)" }}>#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] min-w-0"><ProductLink store={p.store} name={p.product_name} className="font-medium" /></div>
                      <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.store}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10px] tabular-nums" style={{ color: "var(--text)" }}>{eur(p.sales_revenue)}</div>
                      <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.units_sold} sold · {(p.roas ?? 0).toFixed(1)}x</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </PageShell>
  )
}
