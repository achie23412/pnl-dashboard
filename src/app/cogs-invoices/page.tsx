"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { ProductLink } from "@/components/ProductLink"
import { FilterBar } from "@/components/PillSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"

interface LineItem {
  quoted_unit?: number | null
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
  quoted_total?: number | null
  quoted_lines?: number
  charged_quoted_lines?: number
  quote_status?: "over" | "under" | "ok" | "partial" | "no_quote" | "no_sheet"
}

// What each status means (shown as the badge and its tooltip).
const QUOTE_STATUS: Record<string, { label: string; tone: "red" | "green" | "amber" | "grey"; why: string }> = {
  over: { label: "Above quote", tone: "red", why: "ShipGoods charged more than our quote sheet (more than $0.50 and 3% per unit). Ask the supplier why." },
  under: { label: "Below quote", tone: "green", why: "Charged less than quoted. In our favour." },
  ok: { label: "As quoted", tone: "green", why: "Charged matches the quote sheet." },
  partial: { label: "Partly quoted", tone: "amber", why: "Some items in this order have no COG $ in the launch sheet, so only those with a quote are compared." },
  no_quote: { label: "No quote in sheet", tone: "grey", why: "This product has no COG $ (USD) filled in the store's launch sheet. Add it to compare." },
  no_sheet: { label: "No quote sheet", tone: "grey", why: "This store has no launch sheet (e.g. LUMEGLASSES), so there's nothing to compare with." },
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
  const [filterStore, setFilterStore] = useState<FilterValue>(EMPTY_FILTER)
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
    if (!passes(filterStore, inv.store)) return false
    if (showDiscrepancies && !inv.has_price_discrepancy) return false
    return true
  })

  const usd = (n: number) => `$${n.toFixed(2)}`

  return (
    <PageShell
      title="COGS Invoices"
      breadcrumb="Finance → COGS Invoices"
      description="Supplier invoices from ShipGoods. What ShipGoods charged vs what was quoted in the launch sheet (COG $ USD). Only paying more than quoted is flagged."
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
          label: "Charged above quote",
          value: summary ? String(summary.discrepancies) : "—",
        },
        {
          label: "ShipGoods balance (USD)",
          value:
            summary?.balance
              ? `${summary.balance.currency === "USD" ? "$" : ""}${summary.balance.amount.toFixed(2)}`
              : "—",
        },
      ]}
      actions={
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      }
    >
      {/* Filters */}
      <FilterBar
        right={
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            {filtered.length} invoices
          </span>
        }
      >
        <FilterSelect label="Store" options={stores} value={filterStore} onChange={setFilterStore} />
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: "var(--text-muted)" }}>
          <input
            type="checkbox"
            checked={showDiscrepancies}
            onChange={(e) => setShowDiscrepancies(e.target.checked)}
            className="rounded"
          />
          Above quote only
        </label>
      </FilterBar>

      {error && <Notice tone="error">Couldn&apos;t load ShipGoods invoices: {error}.</Notice>}

      {loading && invoices.length === 0 && <Loading>Loading ShipGoods invoices…</Loading>}

      {/* Invoice table */}
      {!loading && filtered.length > 0 && (
        <Panel pad={false}>
          <table className="w-full text-[11px]">
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}
                >
                  Date
                </th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}
                >
                  Store
                </th>
                <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}
                >
                  Order
                </th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}
                >
                  Product total
                </th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}
                >
                  Discount
                </th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}
                  title="What ShipGoods charged for items that have a quote. Full invoice total shown below when different."
                >
                  Charged
                </th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}
                  title="Our quote (launch sheet COG $ x quantity) for the items that have a quote"
                >
                  Quoted
                </th>
                <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}
                  title="Charged minus quoted, for the quoted items. Positive = paid more than quoted."
                >
                  Difference
                </th>
                <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}
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
                    style={ROW_BORDER}
                    onClick={() =>
                      setExpanded(isExpanded ? null : inv.id)
                    }
                  >
                    <td className={TD}>
                      <div
                        className="tabular-nums"
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
                                <ProductLink store={inv.store} name={li.title} maxWidth={260} />
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
                                className="tabular-nums"
                                style={{ color: "var(--text)" }}
                              >
                                {usd(li.unit_cost)}
                              </span>
                              <span
                                className="tabular-nums"
                                style={{
                                  color:
                                    li.quoted_unit == null
                                      ? "var(--text-dim)"
                                      : li.unit_cost - li.quoted_unit > 0.5
                                        ? "var(--red)"
                                        : "var(--green)",
                                }}
                              >
                                {li.quoted_unit == null ? "no quote" : `quoted ${usd(li.quoted_unit)}`}
                              </span>
                              <span
                                className="tabular-nums"
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
                      className={`${TD} text-[10px]`}
                      style={{ color: "var(--text-muted)" }}
                    >
                      {inv.store}
                    </td>
                    <td
                      className={`${TD} tabular-nums text-[10px]`}
                      style={{ color: "var(--text-muted)" }}
                    >
                      #{inv.order_id_in_shop}
                    </td>
                    <td
                      className={`${TD} text-right tabular-nums`}
                      style={{ color: "var(--text)" }}
                    >
                      {usd(inv.product_total)}
                    </td>
                    <td
                      className={`${TD} text-right tabular-nums`}
                      style={{
                        color: inv.discount > 0 ? "var(--green)" : "var(--text-dim)",
                      }}
                    >
                      {inv.discount > 0 ? `-${usd(inv.discount)}` : "—"}
                    </td>
                    <td
                      className={`${TD} text-right tabular-nums font-medium`}
                      style={{ color: "var(--text)" }}
                    >
                      {inv.charged_quoted_lines != null && inv.quoted_total != null ? (
                        <>
                          {usd(inv.charged_quoted_lines)}
                          {Math.abs(inv.charged_quoted_lines - inv.amount) > 0.01 && (
                            <div className="text-[9px] font-normal" style={{ color: "var(--text-dim)" }}>
                              of {usd(inv.amount)} invoice
                            </div>
                          )}
                        </>
                      ) : (
                        usd(inv.amount)
                      )}
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>
                      {inv.quoted_total != null ? usd(inv.quoted_total) : "—"}
                    </td>
                    <td
                      className={`${TD} text-right tabular-nums font-medium`}
                      style={{
                        color:
                          inv.quoted_total == null
                            ? "var(--text-dim)"
                            : (inv.charged_quoted_lines ?? 0) - inv.quoted_total > 0.5
                              ? "var(--red)"
                              : "var(--green)",
                      }}
                    >
                      {inv.quoted_total == null
                        ? "—"
                        : `${(inv.charged_quoted_lines ?? 0) - inv.quoted_total >= 0 ? "+" : "−"}${usd(Math.abs((inv.charged_quoted_lines ?? 0) - inv.quoted_total))}`}
                    </td>
                    <td className={`${TD} text-center`}>
                      {(() => {
                        const st = QUOTE_STATUS[inv.quote_status || (inv.has_price_discrepancy ? "over" : "ok")]
                        return (
                          <Badge tone={st.tone} title={st.why}>
                            {st.label}
                          </Badge>
                        )
                      })()}
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
        </Panel>
      )}

      {!loading && invoices.length > 0 && filtered.length === 0 && (
        <EmptyState title="No invoices match these filters">Clear the store filter or untick &quot;Above quote only&quot;.</EmptyState>
      )}

      {!loading && invoices.length === 0 && !error && (
        <EmptyState title="No invoices from ShipGoods">
          Check that SHIPGOODS_TOKEN is set in the Vercel environment variables.
        </EmptyState>
      )}
    </PageShell>
  )
}
