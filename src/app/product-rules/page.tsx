"use client"
import { useEffect, useMemo, useState } from "react"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { PageShell } from "@/components/PageShell"
import { FixBanner } from "@/components/FixBanner"
import { SHOPIFY_STORES, STORE_COLORS } from "@/lib/constants"

interface CatalogProduct {
  product_name: string
  store: string
  cogs_usd: number | null
  retail_price: number | null
  cog_pct: number | null
  units_sold: number
  sales_revenue: number
  cogs_source: "shipgoods" | "sheet" | "none"
  ad_spend: number | null
  roas: number | null
  be_roas: number | null
  product_ids: string[]
}

interface StoreSummary {
  store: string
  revenue: number
  ad_spend: number
  roas: number | null
  be_roas: number | null
  product_level_spend: boolean
  spend_threshold: number
  currency: string
}

type Verdict = "scale" | "live" | "review" | "draft" | "new"

interface RatedProduct extends CatalogProduct {
  verdict: Verdict
  rule: string
  margin: number | null
}

const VERDICT_META: Record<Verdict, { label: string; color: string; bg: string }> = {
  scale: { label: "Scale", color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  live: { label: "Live", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  review: { label: "Review", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  draft: { label: "Draft", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  new: { label: "New", color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
}

const SYM: Record<string, string> = { EUR: "€", GBP: "£", USD: "$" }
const money = (n: number, cur: string) => `${SYM[cur] || cur + " "}${n.toFixed(n >= 100 ? 0 : 2)}`
const x = (r: number | null) => (r == null ? "—" : `${r.toFixed(2)}x`)

const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)

type SortKey = "product" | "store" | "verdict" | "units" | "revenue" | "spend" | "roas" | "be_roas" | "margin"
const VERDICT_ORDER: Record<Verdict, number> = { draft: 0, review: 1, live: 2, scale: 3, new: 4 }

async function loadWindow(from: string, to: string) {
  const res = await fetch(`/api/product-catalog?store=all&from=${from}&to=${to}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json as { products: CatalogProduct[]; stores: StoreSummary[]; errors?: string[] }
}

function classifyProducts(
  d30: CatalogProduct[],
  d14: CatalogProduct[],
  d7: CatalogProduct[],
  prev7: CatalogProduct[],
  stores: StoreSummary[]
): RatedProduct[] {
  const storeInfo = new Map(stores.map((s) => [s.store, s]))
  const keyOf = (p: { store: string; product_name: string }) => `${p.store}|${p.product_name}`
  const i14 = new Map(d14.map((p) => [keyOf(p), p]))
  const i7 = new Map(d7.map((p) => [keyOf(p), p]))
  const iPrev = new Map(prev7.map((p) => [keyOf(p), p]))

  return d30.map((p) => {
    const st = storeInfo.get(p.store)
    const margin = p.cog_pct != null ? 100 - p.cog_pct : null
    const base: RatedProduct = { ...p, verdict: "live", rule: "Active product", margin }

    if (!st || !st.product_level_spend || p.ad_spend == null) {
      if (p.units_sold === 0) return { ...base, verdict: "new", rule: "No sales yet" }
      if (p.be_roas != null && p.roas != null && p.roas < p.be_roas)
        return { ...base, verdict: "review", rule: "Below breakeven (store-level)" }
      return base
    }

    const cur = st.currency
    const th = st.spend_threshold
    const spend = p.ad_spend
    const roas30 = p.roas ?? (spend > 0 ? p.sales_revenue / spend : null)
    const r14 = i14.get(keyOf(p))
    const r7 = i7.get(keyOf(p))
    const prev = iPrev.get(keyOf(p))
    const roas14 = r14?.roas ?? null
    const roas7 = r7?.roas ?? null

    // No spend and no sales → new
    if (spend < 1 && p.units_sold === 0) return { ...base, verdict: "new", rule: "No spend, no sales" }

    // === DRAFT rules (critical — act now) ===

    // Rule 1: no sale, spend over threshold
    if (p.units_sold === 0 && spend >= th)
      return { ...base, verdict: "draft", rule: `SOP rule 1 — ${money(spend, cur)} spent, 0 sales` }

    // Rule 4: sells but ROAS < 1 with meaningful spend
    const fifty = (th / 30) * 50
    if (p.units_sold > 0 && spend >= fifty && roas30 != null && roas30 < 1)
      return { ...base, verdict: "draft", rule: `SOP rule 4 — ROAS ${x(roas30)}, losing money` }

    // === REVIEW / DRAFT zone: spend >= threshold and ROAS <= 2.2 ===
    if (spend >= th && roas30 != null && roas30 <= 2.2) {
      const up = roas14 != null && roas7 != null && roas30! < roas14 && roas14 < roas7
      const down = roas14 != null && roas7 != null && roas30! > roas14 && roas14 > roas7
      const spend7 = r7?.ad_spend ?? 0
      const spend14 = r14?.ad_spend ?? 0
      const thX100 = 100 * (th / 30)

      // Rule 7: high spend at low ROAS → draft
      if ((roas7 != null && roas7 < 2 && spend7 >= thX100) || (roas14 != null && roas14 < 2 && spend14 >= thX100))
        return { ...base, verdict: "draft", rule: "SOP rule 7 — high spend, low ROAS" }

      // Rule 8: 30d ROAS < 1.7 → draft
      if (roas30 < 1.7)
        return { ...base, verdict: "draft", rule: `SOP rule 8 — ROAS ${x(roas30)} (< 1.70x)` }

      // Rule 10: no sales in 14d + stagnating → draft
      const noSale14 = (r14?.units_sold ?? 0) === 0
      const prevSpend = prev?.ad_spend ?? 0
      if (noSale14 && spend7 <= prevSpend)
        return { ...base, verdict: "draft", rule: "SOP rule 10 — 0 sales in 14d, stagnating" }

      // Rule 6: improving ROAS → review (keep, check next week)
      if (up)
        return { ...base, verdict: "review", rule: "SOP rule 6 — low ROAS but improving" }

      // Rule 9: falling ROAS >= 1.7 → review (raise price)
      if (down && roas30 >= 1.7)
        return { ...base, verdict: "review", rule: "SOP rule 9 — ROAS falling, raise price" }

      // Generic review: near breakeven
      return { ...base, verdict: "review", rule: `ROAS ${x(roas30)} ≤ 2.2x — monitor` }
    }

    // Below breakeven ROAS
    if (p.units_sold > 0 && roas30 != null && p.be_roas != null && roas30 < p.be_roas && spend >= th)
      return { ...base, verdict: "review", rule: `Below breakeven (${x(roas30)} vs ${x(p.be_roas)})` }

    // === SCALE: strong performers ===
    if (spend >= th && roas30 != null && roas30 > 2.2 && p.units_sold >= 3)
      return { ...base, verdict: "scale", rule: `ROAS ${x(roas30)} — scale candidate` }

    // No spend but selling → live
    if (p.units_sold > 0 && spend < 1)
      return { ...base, verdict: "live", rule: "Selling (no ad spend tracked)" }

    // Default: live
    return base
  })
}

export default function ProductRulesPage() {
  const [products, setProducts] = useState<RatedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [fStore, setFStoreF] = useState<FilterValue>(EMPTY_FILTER)
  const [fVerdict, setFVerdictF] = useState<FilterValue>(EMPTY_FILTER)
  // Single-value setters (chips, Fix banner) on top of the multi-select filters.
  const setFStore = (v: string) => setFStoreF(v === "all" ? EMPTY_FILTER : { mode: "include", values: [v] })
  const setFVerdict = (v: "all" | Verdict) => setFVerdictF(v === "all" ? EMPTY_FILTER : { mode: "include", values: [v] })
  const [sortKey, setSortKey] = useState<SortKey>("verdict")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const st = sp.get("store") || sp.get("fix_store")
    if (st) setFStore(st)
  }, [])

  useEffect(() => {
    Promise.all([
      loadWindow(day(29), day(0)),
      loadWindow(day(13), day(0)),
      loadWindow(day(6), day(0)),
      loadWindow(day(13), day(7)),
    ])
      .then(([d30, d14, d7, prev7]) => {
        const rated = classifyProducts(d30.products, d14.products, d7.products, prev7.products, d30.stores)
        setProducts(rated)
        setWarnings((d30.errors || []).filter((e) => !e.includes("no Shopify token")))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const stores = useMemo(() => Array.from(new Set(products.map((p) => p.store))).sort(), [products])
  const visible = useMemo(() => {
    let list = products.filter(
      (p) => passes(fStore, p.store) && passes(fVerdict, p.verdict)
    )
    list.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "product": cmp = a.product_name.localeCompare(b.product_name); break
        case "store": cmp = a.store.localeCompare(b.store); break
        case "verdict": cmp = VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict]; break
        case "units": cmp = a.units_sold - b.units_sold; break
        case "revenue": cmp = a.sales_revenue - b.sales_revenue; break
        case "spend": cmp = (a.ad_spend ?? 0) - (b.ad_spend ?? 0); break
        case "roas": cmp = (a.roas ?? 0) - (b.roas ?? 0); break
        case "be_roas": cmp = (a.be_roas ?? 0) - (b.be_roas ?? 0); break
        case "margin": cmp = (a.margin ?? 0) - (b.margin ?? 0); break
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return list
  }, [products, fStore, fVerdict, sortKey, sortDir])

  const count = (v: Verdict) => products.filter((p) => p.verdict === v).length
  const avgMargin = useMemo(() => {
    const withMargin = products.filter((p) => p.margin != null)
    if (withMargin.length === 0) return null
    return withMargin.reduce((s, p) => s + p.margin!, 0) / withMargin.length
  }, [products])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir(key === "verdict" ? "asc" : "desc") }
  }

  function shopifyLink(p: RatedProduct) {
    const cfg = SHOPIFY_STORES[p.store]
    if (!cfg || !p.product_ids[0]) return null
    return `https://admin.shopify.com/store/${cfg.domain.replace(".myshopify.com", "")}/products/${p.product_ids[0]}`
  }

  const field = "bg-transparent border rounded-md px-2 py-1 text-[10px]"
  const border = { borderColor: "rgba(255,255,255,0.1)", color: "var(--text)" }
  const thStyle = "text-[9px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap"

  const SortArrow = ({ k }: { k: SortKey }) =>
    sortKey === k ? <span className="ml-0.5 opacity-60">{sortDir === "asc" ? "▲" : "▼"}</span> : null

  return (
    <PageShell
      title="Product Rules"
      breadcrumb="Front End → Product Rules"
      description="Every product is classified against the Ascend Drafting SOP. Draft = take offline, Review = needs attention, Live = healthy, Scale = winning."
      stats={[
        { label: "Live products", value: loading ? "—" : String(count("live")) },
        { label: "To review", value: loading ? "—" : String(count("review")) },
        { label: "To draft", value: loading ? "—" : String(count("draft")) },
        { label: "Avg margin", value: loading ? "—" : avgMargin != null ? `${avgMargin.toFixed(1)}%` : "—" },
      ]}
    >
      <FixBanner onApply={(ctx) => {
        if (ctx.store) setFStore(ctx.store)
        setFVerdict("draft")
      }} />

      {/* Verdict summary pills */}
      {!loading && (
        <div className="flex flex-wrap gap-2 mb-3">
          {(["draft", "review", "live", "scale", "new"] as Verdict[]).map((v) => {
            const c = count(v)
            const meta = VERDICT_META[v]
            const active = fVerdict.mode === "include" && fVerdict.values.length === 1 && fVerdict.values[0] === v
            return (
              <button
                key={v}
                onClick={() => setFVerdict(active ? "all" : v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  background: active ? meta.bg : "rgba(255,255,255,0.03)",
                  border: `1px solid ${active ? meta.color : "rgba(255,255,255,0.08)"}`,
                  color: active ? meta.color : "var(--text-muted)",
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                {meta.label}
                <span className="ml-0.5 opacity-70">{c}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <FilterSelect
          label="Store"
          options={stores.map((s) => ({ value: s, count: products.filter((p) => p.store === s).length }))}
          value={fStore}
          onChange={setFStoreF}
        />
        <FilterSelect
          label="Status"
          options={(["draft", "review", "live", "scale", "new"] as Verdict[]).map((v) => ({ value: v, label: VERDICT_META[v].label, count: count(v) }))}
          value={fVerdict}
          onChange={setFVerdictF}
        />
        <div className="ml-auto text-[10px]" style={{ color: "var(--text-dim)" }}>
          {visible.length} of {products.length} products
        </div>
      </div>

      {error && <div className="text-[11px] mb-3" style={{ color: "var(--red)" }}>{error}</div>}
      {warnings.length > 0 && (
        <div className="text-[10px] mb-3" style={{ color: "var(--orange)" }}>
          Some data didn&apos;t load: {warnings.join("; ")}
        </div>
      )}

      {loading ? (
        <div className="text-[11px] py-12 text-center" style={{ color: "var(--text-dim)" }}>
          Classifying products against the drafting rules…
        </div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-xl text-[11px] py-10 text-center" style={{ color: "var(--text-dim)" }}>
          No products match the current filters.
        </div>
      ) : (
        <div className="glass rounded-xl overflow-x-auto">
          <table className="w-full text-[11px]" style={{ color: "var(--text)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className={`${thStyle} text-left px-3 py-2`} style={{ color: "var(--text-dim)" }} onClick={() => toggleSort("verdict")}>
                  Status<SortArrow k="verdict" />
                </th>
                <th className={`${thStyle} text-left px-3 py-2`} style={{ color: "var(--text-dim)" }} onClick={() => toggleSort("product")}>
                  Product<SortArrow k="product" />
                </th>
                <th className={`${thStyle} text-left px-3 py-2`} style={{ color: "var(--text-dim)" }} onClick={() => toggleSort("store")}>
                  Store<SortArrow k="store" />
                </th>
                <th className={`${thStyle} text-right px-3 py-2`} style={{ color: "var(--text-dim)" }} onClick={() => toggleSort("units")}>
                  Units<SortArrow k="units" />
                </th>
                <th className={`${thStyle} text-right px-3 py-2`} style={{ color: "var(--text-dim)" }} onClick={() => toggleSort("revenue")}>
                  Revenue<SortArrow k="revenue" />
                </th>
                <th className={`${thStyle} text-right px-3 py-2`} style={{ color: "var(--text-dim)" }} onClick={() => toggleSort("spend")}>
                  Spend<SortArrow k="spend" />
                </th>
                <th className={`${thStyle} text-right px-3 py-2`} style={{ color: "var(--text-dim)" }} onClick={() => toggleSort("roas")}>
                  ROAS<SortArrow k="roas" />
                </th>
                <th className={`${thStyle} text-right px-3 py-2`} style={{ color: "var(--text-dim)" }} onClick={() => toggleSort("be_roas")}>
                  BE ROAS<SortArrow k="be_roas" />
                </th>
                <th className={`${thStyle} text-right px-3 py-2`} style={{ color: "var(--text-dim)" }} onClick={() => toggleSort("margin")}>
                  Margin<SortArrow k="margin" />
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const vm = VERDICT_META[p.verdict]
                const k = `${p.store}|${p.product_name}`
                const isExpanded = expanded === k
                const link = shopifyLink(p)
                const roasColor =
                  p.roas == null ? "var(--text-dim)" :
                  p.be_roas != null && p.roas < p.be_roas ? "var(--red)" :
                  p.roas >= 2.2 ? "var(--green)" :
                  "var(--orange)"
                const marginColor =
                  p.margin == null ? "var(--text-dim)" :
                  p.margin >= 50 ? "var(--green)" :
                  p.margin >= 30 ? "var(--text)" :
                  "var(--red)"

                return (
                  <tr
                    key={k}
                    className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onClick={() => setExpanded(isExpanded ? null : k)}
                  >
                    <td className="px-3 py-2">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold"
                        style={{ background: vm.bg, color: vm.color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: vm.color }} />
                        {vm.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium truncate max-w-[200px]" title={p.product_name}>
                          {link ? (
                            <a href={link} target="_blank" rel="noreferrer" className="hover:underline" onClick={(e) => e.stopPropagation()}>
                              {p.product_name}
                            </a>
                          ) : p.product_name}
                        </span>
                        {isExpanded && (
                          <span className="text-[9px] mt-0.5" style={{ color: vm.color }}>
                            {p.rule}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: STORE_COLORS[p.store] || "#666" }} />
                        {p.store}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.units_sold}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.sales_revenue > 0 ? `€${p.sales_revenue.toFixed(0)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: p.ad_spend != null ? "var(--text)" : "var(--text-dim)" }}>
                      {p.ad_spend != null ? `€${p.ad_spend.toFixed(0)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: roasColor }}>
                      {x(p.roas)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-dim)" }}>
                      {x(p.be_roas)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: marginColor }}>
                      {p.margin != null ? `${p.margin.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 glass rounded-xl px-4 py-3">
        <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
          How verdicts are decided (Ascend Drafting SOP)
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <div><span style={{ color: VERDICT_META.draft.color }} className="font-semibold">Draft</span> — SOP rules 1, 4, 7, 8, 10: no sales + spend, ROAS &lt; 1, high spend low ROAS, 30d ROAS &lt; 1.7, stagnating</div>
          <div><span style={{ color: VERDICT_META.review.color }} className="font-semibold">Review</span> — SOP rules 6, 9: improving or falling ROAS, below breakeven but not draft-worthy yet</div>
          <div><span style={{ color: VERDICT_META.scale.color }} className="font-semibold">Scale</span> — ROAS &gt; 2.2x with 3+ sales and spend above threshold: add budget</div>
          <div><span style={{ color: VERDICT_META.live.color }} className="font-semibold">Live</span> — Healthy product, no action needed</div>
        </div>
        <div className="text-[9px] mt-2" style={{ color: "var(--text-dim)" }}>
          Google stores (Walsh &amp; Farley, Carter &amp; Collins, Susan &amp; Allen) have per-product ad spend from Google Shopping. Meta stores (LUMEGLASSES, Blinky) only get store-level and margin-based verdicts. Click a row to see the rule.
        </div>
      </div>
    </PageShell>
  )
}
