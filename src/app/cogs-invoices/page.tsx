"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"

interface LineItem {
  title: string
  variant_title: string
  quantity: number
  unit_cost: number
  product_cost: number
  sold_price: number
}

interface Invoice {
  id: number
  date: string
  store: string
  order_number: string
  order_id_in_shop: string
  amount: number
  product_total: number
  discount: number
  items: LineItem[]
  has_price_discrepancy: boolean
}

interface Summary {
  total_invoices_30d: number
  total_invoiced_30d: number
  total_invoiced_7d: number
  discrepancies: number
  balance: { amount: number; currency: string } | null
}

export default function CogsInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState<number | null>(null)
  const [filterStore, setFilterStore] = useState("all")
  const [showDiscrepancies, setShowDiscrepancies] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/supplier-data")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setInvoices(data.invoices || [])
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

  const stores = Array.from(new Set(invoices.map((inv) => inv.store)))
  const filtered = invoices.filter((inv) => {
    if (filterStore !== "all" && inv.store !== filterStore) return false
    if (showDiscrepancies && !inv.has_price_discrepancy) return false
    return true
  })

  const usd = (n: number) => `$${n.toFixed(2)}`

  return (
    <PageShell
      title="COGS Invoices"
      breadcrumb="Finance → COGS Invoices"
      description="Supplier invoices from ShipGoods. Match charged costs with quoted prices and flag discrepancies."
      stats={[
        {
          label: "Invoices (30d)",
          value: summary ? String(summary.total_invoices_30d) : "—",
        },
        {
          label: "Total invoiced (30d)",
          value: summary ? usd(summary.total_invoiced_30d) : "—",
        },
        {
          label: "Price discrepancies",
          value: summary ? String(summary.discrepancies) : "—",
        },
        {
          label: "SG Balance",
          value:
            summary?.balance
              ? `${summary.balance.currency === "USD" ? "$" : ""}${summary.balance.amount.toFixed(2)}`
              : "—",
        },
      ]}
    >
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
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
        <label
          className="flex items-center gap-1.5 text-[11px] cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          <input
            type="checkbox"
            checked={showDiscrepancies}
            onChange={(e) => setShowDiscrepancies(e.target.checked)}
            className="rounded"
          />
          Discrepancies only
        </label>
        <span
          className="text-[10px] ml-auto"
          style={{ color: "var(--text-dim)" }}
        >
          {filtered.length} invoices
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

      {loading && invoices.length === 0 && (
        <div className="glass rounded-xl p-8 text-center">
          <div
            className="text-[11px]"
            style={{ color: "var(--text-dim)" }}
          >
            Loading ShipGoods invoice data...
          </div>
        </div>
      )}

      {/* Invoice table */}
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
                  Date
                </th>
                <th
                  className="text-left px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Store
                </th>
                <th
                  className="text-left px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Order
                </th>
                <th
                  className="text-right px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Product total
                </th>
                <th
                  className="text-right px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Discount
                </th>
                <th
                  className="text-right px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Charged
                </th>
                <th
                  className="text-center px-3 py-2.5 font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((inv) => {
                const isExpanded = expanded === inv.id
                return (
                  <tr
                    key={inv.id}
                    className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                    onClick={() =>
                      setExpanded(isExpanded ? null : inv.id)
                    }
                  >
                    <td className="px-4 py-2.5">
                      <div
                        className="font-mono"
                        style={{ color: "var(--text)" }}
                      >
                        {inv.date}
                      </div>
                      {isExpanded && inv.items.length > 0 && (
                        <div
                          className="mt-2 p-2 rounded-lg text-[10px]"
                          style={{
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div
                            className="font-semibold mb-1"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Line items
                          </div>
                          {inv.items.map((li, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-3 py-1"
                              style={{
                                borderBottom:
                                  i < inv.items.length - 1
                                    ? "1px solid rgba(255,255,255,0.04)"
                                    : "none",
                              }}
                            >
                              <span
                                className="flex-1 truncate"
                                style={{ color: "var(--text)" }}
                              >
                                {li.title}
                                {li.variant_title
                                  ? ` — ${li.variant_title}`
                                  : ""}
                              </span>
                              <span
                                style={{
                                  color: "var(--text-dim)",
                                }}
                              >
                                x{li.quantity}
                              </span>
                              <span
                                className="font-mono"
                                style={{ color: "var(--text)" }}
                              >
                                {usd(li.unit_cost)}
                              </span>
                              <span
                                className="font-mono"
                                style={{
                                  color: "var(--text-dim)",
                                }}
                              >
                                sold {usd(li.sold_price)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td
                      className="px-3 py-2.5 text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {inv.store}
                    </td>
                    <td
                      className="px-3 py-2.5 font-mono text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      #{inv.order_id_in_shop}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-mono"
                      style={{ color: "var(--text)" }}
                    >
                      {usd(inv.product_total)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-mono"
                      style={{
                        color: inv.discount > 0 ? "#4ade80" : "var(--text-dim)",
                      }}
                    >
                      {inv.discount > 0 ? `-${usd(inv.discount)}` : "—"}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-mono font-medium"
                      style={{ color: "var(--text)" }}
                    >
                      {usd(inv.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {inv.has_price_discrepancy ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-[9px] font-medium"
                          style={{
                            background: "rgba(239,68,68,0.12)",
                            color: "#f87171",
                          }}
                        >
                          Price mismatch
                        </span>
                      ) : (
                        <span
                          className="px-2 py-0.5 rounded-full text-[9px] font-medium"
                          style={{
                            background: "rgba(74,222,128,0.12)",
                            color: "#4ade80",
                          }}
                        >
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <div
              className="text-center py-2 text-[10px]"
              style={{ color: "var(--text-dim)" }}
            >
              Showing 100 of {filtered.length} invoices
            </div>
          )}
        </div>
      )}

      {!loading && invoices.length === 0 && !error && (
        <div className="glass rounded-xl p-8 text-center">
          <div
            className="text-[13px] font-medium mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            No invoice data
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
