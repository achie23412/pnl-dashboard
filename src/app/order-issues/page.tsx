"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { FixBanner } from "@/components/FixBanner"
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
  problem: string
  amount: number
  currency: string
  created_at: string
  updated_at: string
  age_hours: number
  trackings: Tracking[]
}

interface Summary {
  total_orders: number
  address_errors: number
  waiting_process: number
  trace_added: number
  quote_pending: number
  stores: Record<string, { total: number; issues: number; shipped: number }>
}

const STATUS_BADGE: Record<string, { label: string; tone: "red" | "amber" | "green" | "grey" }> = {
  address_error: { label: "Address error", tone: "red" },
  waiting_process: { label: "Waiting", tone: "amber" },
  trace_added: { label: "Shipped", tone: "green" },
}

function ageLabel(hours: number) {
  if (hours < 24) return `${hours}h`
  const d = Math.floor(hours / 24)
  return `${d}d ${hours % 24}h`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export default function OrderIssuesPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filterStore, setFilterStore] = useState<FilterValue>(EMPTY_FILTER)
  const [filterStatus, setFilterStatus] = useState<FilterValue>(EMPTY_FILTER)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/supply-chain")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      const issues = (data.orders as Order[]).filter(
        (o) => o.status === "address_error" || o.status === "waiting_process"
      )
      setOrders(issues)
      setSummary(data.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const stores = Array.from(new Set(orders.map((o) => o.store)))
  const statuses = Array.from(new Set(orders.map((o) => o.status)))
  const filtered = orders.filter((o) => {
    if (!passes(filterStore, o.store)) return false
    if (!passes(filterStatus, o.status)) return false
    return true
  })

  const stuck = orders.filter((o) => o.status === "waiting_process" && o.age_hours > 48).length

  return (
    <PageShell
      title="Order Issues"
      breadcrumb="Supply Chain → Order Issues"
      description="Orders with problems from ShipGoods: address errors, stuck processing, quote pending. Only LUMEGLASSES and Blinky fulfilled through ShipGoods."
      stats={[
        { label: "Open issues", value: summary ? String(orders.length) : "—" },
        { label: "Address errors", value: summary ? String(summary.address_errors) : "—" },
        { label: "Stuck (>48h)", value: summary ? String(stuck) : "—" },
        { label: "Quote pending", value: summary ? String(summary.quote_pending) : "—" },
      ]}
      actions={
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      }
    >
      <FixBanner />
      <FilterBar
        right={
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            {filtered.length} issues
          </span>
        }
      >
        <FilterSelect label="Store" options={stores} value={filterStore} onChange={setFilterStore} />
        <FilterSelect label="Status" options={statuses} value={filterStatus} onChange={setFilterStatus} />
      </FilterBar>

      {error && <Notice tone="error">Couldn&apos;t load order issues: {error}.</Notice>}
      {loading && orders.length === 0 && <Loading>Loading ShipGoods orders…</Loading>}

      {!loading && filtered.length > 0 && (
        <Panel pad={false}>
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Created</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Store</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Order</th>
                <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}>Status</th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Problem</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Amount</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const badge = STATUS_BADGE[o.status] || { label: o.status, tone: "grey" as const }
                return (
                  <tr key={o.order_id} style={ROW_BORDER} className="hover:bg-white/[0.02] transition-colors">
                    <td className={`${TD} tabular-nums`} style={{ color: "var(--text)" }}>
                      {fmtDate(o.created_at)}
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
                    <td className={`${TD} text-center`}>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td className={TD} style={{ color: "var(--text-muted)" }}>
                      {o.problem}
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>
                      ${o.amount.toFixed(2)}
                    </td>
                    <td
                      className={`${TD} text-right tabular-nums`}
                      style={{ color: o.age_hours > 72 ? "var(--red)" : o.age_hours > 48 ? "var(--orange)" : "var(--text-muted)" }}
                    >
                      {ageLabel(o.age_hours)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {!loading && orders.length > 0 && filtered.length === 0 && (
        <EmptyState title="No issues match these filters">Clear the store or status filter.</EmptyState>
      )}

      {!loading && orders.length === 0 && !error && (
        <EmptyState title="No order issues">All recent ShipGoods orders are on track.</EmptyState>
      )}

      {/* Store breakdown */}
      {summary && Object.keys(summary.stores).length > 0 && (
        <Panel title="Issues by store" pad={false}>
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Store</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Total orders</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Issues</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Shipped</th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Issue rate</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.stores)
                .sort(([, a], [, b]) => b.issues - a.issues)
                .map(([store, s]) => (
                  <tr key={store} style={ROW_BORDER}>
                    <td className={TD}>
                      <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: "var(--text)" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: STORE_COLORS[store] || "#666" }} />
                        {store}
                      </span>
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{s.total}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: s.issues > 0 ? "var(--red)" : "var(--text-muted)" }}>
                      {s.issues}
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--green)" }}>{s.shipped}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: s.total > 0 && s.issues / s.total > 0.1 ? "var(--red)" : "var(--text-muted)" }}>
                      {s.total > 0 ? `${((s.issues / s.total) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Panel>
      )}
    </PageShell>
  )
}
