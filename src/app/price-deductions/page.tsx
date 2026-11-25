"use client"
// Price Deductions: volume tiers with the supplier. Units per product from ShipGoods (last 30 days);
// at 20 units ask for a volume discount (tier 1), at 60 a bigger one (tier 2). Track what was asked
// and agreed, and the saving per month.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { ProductLink } from "@/components/ProductLink"
import type { ProductFlag } from "@/app/api/product-flags/route"

type SupplierProduct = { title: string; variant_title: string | null; store: string; total_qty: number; total_cogs: number; avg_cost: number; quote_price: number | null; sale_price: number; cogs_pct: number | null }
const TIERS = [20, 60] // units per 30 days (Supplier Costs uses 20 as "request volume discount")
const NEAR = 0.75 // within 75% of the next tier
const usd = (n: number) => `$${n.toFixed(2)}`
const STATUSES = [
  { value: "asked", label: "Asked supplier", tone: "amber" as const },
  { value: "agreed", label: "Agreed", tone: "green" as const },
  { value: "declined", label: "Declined", tone: "grey" as const },
]

export default function PriceDeductionsPage() {
  const [products, setProducts] = useState<SupplierProduct[] | null>(null)
  const [flags, setFlags] = useState<ProductFlag[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fStore, setFStore] = useState<FilterValue>(EMPTY_FILTER)
  const [fTier, setFTier] = useState<FilterValue>(EMPTY_FILTER)
  const [open, setOpen] = useState<string | null>(null)
  const [price, setPrice] = useState("")
  const [note, setNote] = useState("")

  const loadFlags = useCallback(() => fetch("/api/product-flags?kind=price").then((r) => r.json()).then((d) => setFlags(d.rows || [])), [])
  useEffect(() => {
    fetch("/api/supplier-data").then((r) => r.json()).then((d) => {
      if (d.error) throw new Error(d.error)
      setProducts(d.products || [])
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
    loadFlags()
  }, [loadFlags])

  const rows = useMemo(() => {
    const by = new Map<string, { store: string; title: string; qty: number; cogs: number; quote: number | null; sale: number }>()
    for (const p of products || []) {
      const k = `${p.store}|${p.title}`
      const prev = by.get(k)
      by.set(k, { store: p.store, title: p.title, qty: (prev?.qty || 0) + p.total_qty, cogs: (prev?.cogs || 0) + p.total_cogs, quote: prev?.quote ?? p.quote_price, sale: p.sale_price || prev?.sale || 0 })
    }
    const fmap = new Map(flags.map((f) => [`${f.store}|${f.product_title}`, f]))
    return Array.from(by.entries()).map(([key, r]) => {
      const avg = r.qty ? r.cogs / r.qty : 0
      const tier = r.qty >= TIERS[1] ? 2 : r.qty >= TIERS[0] ? 1 : 0
      const next = tier < 2 ? TIERS[tier] : null
      const near = next != null && r.qty >= next * NEAR
      const flag = fmap.get(key)
      const agreed = flag?.status === "agreed" ? Number(flag.data?.agreed_price) || null : null
      const saving = agreed != null && agreed < avg ? (avg - agreed) * r.qty : 0
      return { key, ...r, avg, tier, next, near, flag, agreed, saving }
    }).filter((r) => r.qty >= 5 || r.flag).sort((a, b) => b.tier - a.tier || b.qty - a.qty)
  }, [products, flags])

  const tierLabel = (r: (typeof rows)[number]) => (r.tier === 2 ? "tier2" : r.tier === 1 ? "tier1" : r.near ? "near" : "below")
  const shown = rows.filter((r) => passes(fStore, r.store) && passes(fTier, tierLabel(r)))
  const stores = Array.from(new Set(rows.map((r) => r.store)))
  const savings = rows.reduce((a, r) => a + r.saving, 0)

  const save = async (r: (typeof rows)[number], status: string) => {
    const agreed = status === "agreed" ? Number(price.replace(",", ".")) : undefined
    await fetch("/api/product-flags", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "price", store: r.store, product_title: r.title, status, note: note || r.flag?.note || null, data: { qty30: r.qty, avg_cost: Math.round(r.avg * 100) / 100, tier: r.tier, ...(agreed ? { agreed_price: agreed } : {}) } }) })
    loadFlags()
  }

  return (
    <PageShell
      title="Price Deductions"
      breadcrumb="Customer Service → Price Deductions"
      description={`Volume tiers with the supplier, from ShipGoods units in the last 30 days: ask for a volume discount at ${TIERS[0]} units, a bigger one at ${TIERS[1]}. Log what you asked and the agreed price to see the saving.`}
      stats={[
        { label: "Products tracked", value: products ? String(rows.length) : "—", sub: "5+ units in 30 days" },
        { label: `At tier 1 (${TIERS[0]})`, value: String(rows.filter((r) => r.tier === 1).length) },
        { label: `At tier 2 (${TIERS[1]})`, value: String(rows.filter((r) => r.tier === 2).length) },
        { label: "Near next tier", value: String(rows.filter((r) => r.near).length), sub: `${NEAR * 100}%+ of the way` },
        { label: "Saving agreed", value: `$${Math.round(savings)}`, sub: "per 30 days at current volume, USD" },
      ]}
    >
      {error && <Notice tone="error">Couldn&apos;t load ShipGoods data: {error}.</Notice>}
      <FilterBar right={<span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{shown.length} products</span>}>
        <FilterSelect label="Store" options={stores.map((s) => ({ value: s, count: rows.filter((r) => r.store === s).length }))} value={fStore} onChange={setFStore} />
        <FilterSelect label="Tier" options={[
          { value: "tier2", label: `Tier 2 (${TIERS[1]}+)`, count: rows.filter((r) => r.tier === 2).length },
          { value: "tier1", label: `Tier 1 (${TIERS[0]}+)`, count: rows.filter((r) => r.tier === 1).length },
          { value: "near", label: "Near tier 1", count: rows.filter((r) => r.tier === 0 && r.near).length },
          { value: "below", label: "Below", count: rows.filter((r) => r.tier === 0 && !r.near).length },
        ]} value={fTier} onChange={setFTier} />
      </FilterBar>

      {!products && !error && <Loading>Loading ShipGoods units and costs…</Loading>}
      {products && shown.length === 0 && <EmptyState title="No products in this view">Products show once they have 5+ units shipped through ShipGoods in the last 30 days.</EmptyState>}
      {products && shown.length > 0 && (
        <Panel pad={false} className="mb-4">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead><tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Product</th><th className={`${TH} text-right`}>Units (30d)</th><th className={`${TH} text-left`}>Progress</th><th className={`${TH} text-right`}>Avg cost</th><th className={`${TH} text-right`}>Quote</th><th className={`${TH} text-left`}>Status</th><th className={`${TH} text-right`}>Saving / 30d</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => {
                  const target = r.next ?? TIERS[1]
                  const pct = Math.min(100, (r.qty / target) * 100)
                  const meta = STATUSES.find((s) => s.value === r.flag?.status)
                  return (
                    <Fragment key={r.key}>
                      <tr style={ROW_BORDER} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => { setOpen(open === r.key ? null : r.key); setPrice(r.agreed ? String(r.agreed) : ""); setNote(r.flag?.note || "") }}>
                        <td className={TD}><ProductLink store={r.store} name={r.title} maxWidth={260} /><div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{r.store}</div></td>
                        <td className={`${TD} text-right tabular-nums`}>{r.qty}</td>
                        <td className={TD}>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: r.tier ? "var(--green)" : r.near ? "#fbbf24" : "#a5b4fc" }} /></div>
                            <Badge tone={r.tier === 2 ? "green" : r.tier === 1 ? "green" : r.near ? "amber" : "grey"}>{r.tier === 2 ? "Tier 2" : r.tier === 1 ? `Tier 1 · ${TIERS[1] - r.qty} to tier 2` : `${target - r.qty} to tier 1`}</Badge>
                          </div>
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{usd(r.avg)}</td>
                        <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{r.quote != null ? usd(r.quote) : "—"}</td>
                        <td className={TD}>{meta ? <Badge tone={meta.tone}>{meta.label}{r.agreed ? ` ${usd(r.agreed)}` : ""}</Badge> : r.tier ? <Badge tone="red">Ask supplier</Badge> : <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>—</span>}</td>
                        <td className={`${TD} text-right tabular-nums`} style={{ color: r.saving ? "var(--green)" : "var(--text-dim)" }}>{r.saving ? usd(r.saving) : "—"}</td>
                      </tr>
                      {open === r.key && (
                        <tr><td colSpan={7} className="px-3 pb-3 whitespace-normal text-[11px]" style={{ color: "var(--text-muted)" }}>
                          <div className="mb-2">{r.tier ? `${r.qty} units in 30 days at ${usd(r.avg)} average. Ask the supplier for a tier ${r.tier} price on this volume; every $0.50 off saves ${usd(0.5 * r.qty)} a month.` : `${r.qty} of ${TIERS[0]} units for tier 1. Ask once it passes ${TIERS[0]}.`}</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Agreed unit price (USD)" className="px-2 py-1 rounded-md text-[11px] w-[160px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }} />
                            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (who, when, conditions)" className="px-2 py-1 rounded-md text-[11px] flex-1 min-w-[200px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }} />
                            {STATUSES.map((s) => <Button key={s.value} size="sm" variant={r.flag?.status === s.value ? "primary" : "secondary"} disabled={s.value === "agreed" && !(Number(price.replace(",", ".")) > 0)} onClick={() => save(r, s.value)}>{s.label}</Button>)}
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
        Units and costs from ShipGoods order costs (USD), last 30 days, same data as Supplier Costs. Tiers: {TIERS[0]} units (Supplier Costs&apos; &quot;request volume discount&quot;) and {TIERS[1]} units. Saving = (average cost − agreed price) × units in the last 30 days.
      </div>
    </PageShell>
  )
}
