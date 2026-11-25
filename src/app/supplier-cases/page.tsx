"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { FilterBar } from "@/components/PillSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { STORE_COLORS } from "@/lib/constants"

interface Order {
  order_id: string
  order_number: string
  store: string
  status: string
  problem: string
  amount: number
  created_at: string
  age_hours: number
}

interface SupplierProduct {
  title: string
  store: string
  cogs_pct: number
  price_alert: boolean
  negotiation_alert: boolean
  cogs_alert: string | null
  cogs_action: string | null
  total_qty: number
  avg_cost: number
  sale_price: number
  quote_price: number | null
}

interface Summary {
  address_errors: number
  waiting_process: number
  quote_pending: number
  stores: Record<string, { total: number; issues: number; shipped: number }>
}

type CaseType = "overcharged" | "address_error" | "stuck_order" | "quality"

interface AggregatedCase {
  type: CaseType
  store: string
  description: string
  affected_orders: number
  severity: "high" | "medium" | "low"
  action: string
}

const CASE_BADGE: Record<CaseType, { label: string; tone: "red" | "amber" | "green" | "grey" }> = {
  overcharged: { label: "Overcharged", tone: "red" },
  address_error: { label: "Address", tone: "red" },
  stuck_order: { label: "Stuck", tone: "amber" },
  quality: { label: "Quality", tone: "amber" },
}

export default function SupplierCasesPage() {
  const [cases, setCases] = useState<AggregatedCase[]>([])
  const [overchargedProducts, setOverchargedProducts] = useState<SupplierProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filterStore, setFilterStore] = useState<FilterValue>(EMPTY_FILTER)
  const [filterType, setFilterType] = useState<FilterValue>(EMPTY_FILTER)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [scRes, sdRes] = await Promise.all([
        fetch("/api/supply-chain"),
        fetch("/api/supplier-data"),
      ])
      const scData = await scRes.json()
      const sdData = await sdRes.json()
      if (!scRes.ok) throw new Error(scData.error || "Failed")

      const summary = scData.summary as Summary
      const orders = scData.orders as Order[]
      const aggregated: AggregatedCase[] = []

      // Address errors by store
      const addrByStore: Record<string, number> = {}
      for (const o of orders) {
        if (o.status === "address_error") {
          addrByStore[o.store] = (addrByStore[o.store] || 0) + 1
        }
      }
      for (const [store, count] of Object.entries(addrByStore)) {
        aggregated.push({
          type: "address_error",
          store,
          description: `${count} order${count > 1 ? "s" : ""} with invalid addresses need correction`,
          affected_orders: count,
          severity: count >= 3 ? "high" : "medium",
          action: "Fix addresses in ShipGoods dashboard",
        })
      }

      // Stuck orders by store
      const stuckByStore: Record<string, number> = {}
      for (const o of orders) {
        if (o.status === "waiting_process" && o.age_hours > 48) {
          stuckByStore[o.store] = (stuckByStore[o.store] || 0) + 1
        }
      }
      for (const [store, count] of Object.entries(stuckByStore)) {
        aggregated.push({
          type: "stuck_order",
          store,
          description: `${count} order${count > 1 ? "s" : ""} stuck in processing for 48+ hours`,
          affected_orders: count,
          severity: count >= 5 ? "high" : "medium",
          action: "Contact ShipGoods support",
        })
      }

      // Overcharged products from supplier-data
      const overcharged: SupplierProduct[] = []
      if (sdRes.ok && sdData.products) {
        for (const p of sdData.products as SupplierProduct[]) {
          if (p.price_alert || p.cogs_alert === "above") {
            overcharged.push(p)
          }
        }
        const storeGroups: Record<string, SupplierProduct[]> = {}
        for (const p of overcharged) {
          if (!storeGroups[p.store]) storeGroups[p.store] = []
          storeGroups[p.store].push(p)
        }
        for (const [store, products] of Object.entries(storeGroups)) {
          aggregated.push({
            type: "overcharged",
            store,
            description: `${products.length} product${products.length > 1 ? "s" : ""} charged above quote`,
            affected_orders: products.reduce((a, p) => a + p.total_qty, 0),
            severity: products.length >= 3 ? "high" : "medium",
            action: "Renegotiate with supplier or update quotes",
          })
        }
        setOverchargedProducts(overcharged)
      }

      setCases(aggregated.sort((a, b) => {
        const sev = { high: 0, medium: 1, low: 2 }
        return sev[a.severity] - sev[b.severity]
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const stores = Array.from(new Set(cases.map((c) => c.store)))
  const types = Array.from(new Set(cases.map((c) => c.type)))
  const filtered = cases.filter((c) => {
    if (!passes(filterStore, c.store)) return false
    if (!passes(filterType, c.type)) return false
    return true
  })

  const highCount = cases.filter((c) => c.severity === "high").length
  const medCount = cases.filter((c) => c.severity === "medium").length

  return (
    <PageShell
      title="Supplier Cases"
      breadcrumb="Supply Chain → Supplier Cases"
      description="Aggregated supplier issues: overcharged COGS, address problems, stuck orders. Built from ShipGoods orders and COGS invoice data."
      stats={[
        { label: "Active cases", value: loading ? "—" : String(cases.length) },
        { label: "High severity", value: loading ? "—" : String(highCount) },
        { label: "Medium severity", value: loading ? "—" : String(medCount) },
        { label: "Overcharged products", value: loading ? "—" : String(overchargedProducts.length) },
      ]}
      actions={
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      }
    >
      <FilterBar
        right={
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            {filtered.length} cases
          </span>
        }
      >
        <FilterSelect label="Store" options={stores} value={filterStore} onChange={setFilterStore} />
        <FilterSelect label="Type" options={types} value={filterType} onChange={setFilterType} />
      </FilterBar>

      {error && <Notice tone="error">Couldn&apos;t load supplier cases: {error}.</Notice>}
      {loading && <Loading>Loading supplier cases…</Loading>}

      {!loading && filtered.length > 0 && (
        <Panel pad={false}>
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}>Severity</th>
                <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}>Type</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Store</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Description</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Affected</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={i} style={ROW_BORDER} className="hover:bg-white/[0.02] transition-colors">
                  <td className={`${TD} text-center`}>
                    <Badge tone={c.severity === "high" ? "red" : c.severity === "medium" ? "amber" : "green"}>
                      {c.severity}
                    </Badge>
                  </td>
                  <td className={`${TD} text-center`}>
                    <Badge tone={CASE_BADGE[c.type].tone}>{CASE_BADGE[c.type].label}</Badge>
                  </td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text)" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: STORE_COLORS[c.store] || "#666" }} />
                      {c.store}
                    </span>
                  </td>
                  <td className={TD} style={{ color: "var(--text)" }}>{c.description}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>
                    {c.affected_orders} orders
                  </td>
                  <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{c.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {!loading && cases.length === 0 && !error && (
        <EmptyState title="No supplier cases">No overcharged products, address errors or stuck orders found.</EmptyState>
      )}

      {/* Overcharged products detail */}
      {!loading && overchargedProducts.length > 0 && (
        <Panel title="Overcharged products" pad={false}>
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Product</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Store</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Avg COGS</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Quote</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>COGS %</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Qty (30d)</th>
              </tr>
            </thead>
            <tbody>
              {overchargedProducts.slice(0, 20).map((p, i) => (
                <tr key={i} style={ROW_BORDER}>
                  <td className={TD} style={{ color: "var(--text)" }}>
                    <div className="max-w-[250px] truncate">{p.title}</div>
                  </td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: STORE_COLORS[p.store] || "#666" }} />
                      {p.store}
                    </span>
                  </td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--red)" }}>
                    ${p.avg_cost.toFixed(2)}
                  </td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>
                    {p.quote_price != null ? `$${p.quote_price.toFixed(2)}` : "—"}
                  </td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: p.cogs_pct > 32 ? "var(--red)" : "var(--text)" }}>
                    {p.cogs_pct.toFixed(1)}%
                  </td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{p.total_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <div className="text-[9px] space-y-0.5" style={{ color: "var(--text-dim)" }}>
        <div>• Cases are auto-generated from ShipGoods order data and COGS invoice comparisons.</div>
        <div>• ShipGoods has no tickets API, so manual cases aren&apos;t tracked here yet.</div>
        <div>• &quot;Overcharged&quot; means ShipGoods charged more than the launch sheet COG $ for that product.</div>
      </div>
    </PageShell>
  )
}
