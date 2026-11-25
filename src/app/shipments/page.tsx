"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { FilterBar } from "@/components/PillSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { STORE_COLORS } from "@/lib/constants"

interface Tracking {
  tracking_number: string
  carrier: string
  tracking_url: string
  item_count: number
}

interface Order {
  order_id: string
  order_number: string
  store: string
  status: string
  amount: number
  currency: string
  created_at: string
  updated_at: string
  age_hours: number
  trackings: Tracking[]
}

interface Summary {
  trace_added: number
  carriers: Record<string, number>
  stores: Record<string, { total: number; issues: number; shipped: number }>
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Order[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filterStore, setFilterStore] = useState<FilterValue>(EMPTY_FILTER)
  const [filterCarrier, setFilterCarrier] = useState<FilterValue>(EMPTY_FILTER)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/supply-chain")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      const shipped = (data.orders as Order[]).filter((o) => o.status === "trace_added")
      setShipments(shipped)
      setSummary(data.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const stores = Array.from(new Set(shipments.map((o) => o.store)))
  const carriers = Array.from(new Set(shipments.flatMap((o) => o.trackings.map((t) => t.carrier))))

  const filtered = shipments.filter((o) => {
    if (!passes(filterStore, o.store)) return false
    if (filterCarrier !== EMPTY_FILTER && !o.trackings.some((t) => passes(filterCarrier, t.carrier))) return false
    return true
  })

  const totalItems = shipments.reduce((a, o) => a + o.trackings.reduce((b, t) => b + t.item_count, 0), 0)
  const totalValue = shipments.reduce((a, o) => a + o.amount, 0)

  return (
    <PageShell
      title="Shipments"
      breadcrumb="Supply Chain → Shipments"
      description="Orders shipped by ShipGoods with tracking numbers. All stores fulfilled through ShipGoods."
      stats={[
        { label: "Shipments (30d)", value: summary ? String(summary.trace_added) : "—" },
        { label: "Items shipped", value: summary ? String(totalItems) : "—" },
        { label: "Total value", value: summary ? `$${totalValue.toFixed(0)}` : "—" },
        { label: "Carriers", value: summary ? String(Object.keys(summary.carriers).length) : "—" },
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
            {filtered.length} shipments
          </span>
        }
      >
        <FilterSelect label="Store" options={stores} value={filterStore} onChange={setFilterStore} />
        <FilterSelect label="Carrier" options={carriers} value={filterCarrier} onChange={setFilterCarrier} />
      </FilterBar>

      {error && <Notice tone="error">Couldn&apos;t load shipments: {error}.</Notice>}
      {loading && shipments.length === 0 && <Loading>Loading shipments from ShipGoods…</Loading>}

      {!loading && filtered.length > 0 && (
        <Panel pad={false}>
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Shipped</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Store</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Order</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Tracking</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Carrier</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Items</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((o) => {
                const isExpanded = expanded === o.order_id
                const primary = o.trackings[0]
                return (
                  <tr
                    key={o.order_id}
                    style={ROW_BORDER}
                    className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : o.order_id)}
                  >
                    <td className={`${TD} tabular-nums`} style={{ color: "var(--text)" }}>
                      {fmtDate(o.updated_at)}
                      {isExpanded && (
                        <div className="mt-1 text-[10px]" style={{ color: "var(--text-dim)" }}>
                          Created {fmtDay(o.created_at)}
                        </div>
                      )}
                    </td>
                    <td className={TD}>
                      <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text)" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: STORE_COLORS[o.store] || "#666" }} />
                        {o.store}
                      </span>
                    </td>
                    <td className={`${TD} tabular-nums`} style={{ color: "var(--text-muted)" }}>
                      #{o.order_number}
                    </td>
                    <td className={TD}>
                      {primary ? (
                        <a
                          href={primary.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline tabular-nums"
                          style={{ color: "var(--blue, #60a5fa)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {primary.tracking_number}
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>—</span>
                      )}
                      {isExpanded && o.trackings.length > 1 && (
                        <div className="mt-1 space-y-0.5">
                          {o.trackings.slice(1).map((t) => (
                            <div key={t.tracking_number}>
                              <a
                                href={t.tracking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline tabular-nums text-[10px]"
                                style={{ color: "var(--blue, #60a5fa)" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t.tracking_number}
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className={TD}>
                      <Badge tone="green">{primary?.carrier || "—"}</Badge>
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>
                      {o.trackings.reduce((a, t) => a + t.item_count, 0)}
                    </td>
                    <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: "var(--text)" }}>
                      ${o.amount.toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <div className="text-center py-2 text-[10px]" style={{ color: "var(--text-dim)" }}>
              Showing 100 of {filtered.length} shipments
            </div>
          )}
        </Panel>
      )}

      {!loading && shipments.length > 0 && filtered.length === 0 && (
        <EmptyState title="No shipments match these filters">Clear the store or carrier filter.</EmptyState>
      )}

      {!loading && shipments.length === 0 && !error && (
        <EmptyState title="No shipments yet">No tracked shipments from ShipGoods in the last 30 days.</EmptyState>
      )}

      {/* Carrier breakdown */}
      {summary && Object.keys(summary.carriers).length > 0 && (
        <Panel title="Carriers" pad={false}>
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Carrier</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Shipments</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.carriers)
                .sort(([, a], [, b]) => b - a)
                .map(([carrier, count]) => {
                  const total = Object.values(summary.carriers).reduce((a, b) => a + b, 0)
                  return (
                    <tr key={carrier} style={ROW_BORDER}>
                      <td className={`${TD} font-medium`} style={{ color: "var(--text)" }}>{carrier}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{count}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>
                        {total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </Panel>
      )}
    </PageShell>
  )
}
