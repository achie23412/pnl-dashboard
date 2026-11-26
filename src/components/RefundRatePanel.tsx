"use client"
// Risky Products → refund rate per product: refunded orders ÷ orders (last 30 days and all-time),
// reasons and net refund loss (refund + COGS not recovered), sorted by net loss.
import { useEffect, useState } from "react"
import { Panel, Badge, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { ProductLink } from "@/components/ProductLink"
import { reasonLabel } from "@/lib/cs-log"
import { passes, type FilterValue } from "@/components/FilterSelect"
import type { ProductRisk } from "@/lib/refund-loss"

type Data = { products: ProductRisk[]; since: string; rule: { rate: number; minOrders: number; minRefunds: number }; error?: string }

export function RefundRatePanel({ fStore }: { fStore: FilterValue }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  useEffect(() => {
    fetch("/api/refund-risk")
      .then((r) => r.json())
      .then((j: Data) => (j.error ? setError(j.error) : setData(j)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) return <Notice tone="error">Couldn&apos;t load refund rates: {error}</Notice>
  if (!data) return <Loading>Loading refund rates per product…</Loading>
  const { rule } = data
  const inStore = data.products.filter((p) => passes(fStore, p.store))
  const shown = all ? inStore : inStore.filter((p) => p.risky)
  const rate = (v: number | null, o: number, f: number) =>
    v == null ? "—" : (
      <span style={{ color: o >= rule.minOrders && f >= rule.minRefunds && v > rule.rate ? "var(--red)" : "var(--text-muted)" }}>
        {v}% <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>({f}/{o})</span>
      </span>
    )
  return (
    <Panel
      title={`Refund rate per product · ${inStore.filter((p) => p.risky).length} risky`}
      sub={`Risky = more than ${rule.rate}% of orders refunded, with at least ${rule.minOrders} orders and ${rule.minRefunds} refunds (last 30 days or all-time). Sorted by net refund loss.`}
      pad={false}
      className="mb-4"
      right={
        <label className="inline-flex items-center gap-1.5 text-[10px] cursor-pointer" style={{ color: "var(--text-muted)" }}>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all products with refunds
        </label>
      }
    >
      {shown.length === 0 ? (
        <EmptyState title={all ? "No refunds yet" : "No product above the refund-rate limit"}>Tick &quot;Show all products with refunds&quot; to see every refunded product.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Product</th>
                <th className={`${TH} text-right`}>Refund rate 30d</th>
                <th className={`${TH} text-right`}>All-time</th>
                <th className={`${TH} text-left`}>Reasons</th>
                <th className={`${TH} text-right`}>Net loss 30d</th>
                <th className={`${TH} text-right`}>Net loss all-time</th>
                <th className={`${TH} text-left`} />
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 200).map((p) => (
                <tr key={`${p.store}|${p.product_id || p.title}`} style={ROW_BORDER}>
                  <td className={TD}>
                    <ProductLink store={p.store} name={p.title} productId={p.product_id} maxWidth={280} noRiskBadge />
                    <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.store}</div>
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{rate(p.rate_30, p.orders_30, p.refunded_30)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{rate(p.rate_all, p.orders_all, p.refunded_all)}</td>
                  <td className={`${TD} text-[10px] whitespace-normal`} style={{ color: "var(--text-muted)" }}>
                    {Object.entries(p.reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${reasonLabel(r)} ${n}`).join(", ")}
                  </td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: p.net_loss_30_eur > 0 ? "var(--red)" : "var(--text-dim)" }}>€{p.net_loss_30_eur.toFixed(0)}</td>
                  <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: "var(--red)" }}>€{p.net_loss_eur.toFixed(0)}</td>
                  <td className={TD}>{p.risky ? <Badge tone="red">Risky ({p.risky_window === "30d" ? "30 days" : "all-time"})</Badge> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-3 py-2 text-[9px]" style={{ color: "var(--text-dim)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        Orders = ShipGoods orders with the product since {data.since} (plus refunded orders that never shipped). Refunds come from the refund log (Shopify refunds are imported automatically; rejected ones don&apos;t count).
        Net loss = refund + COGS not recovered from ShipGoods on full refunds; a partial refund counts the refund only. All in EUR.
      </div>
    </Panel>
  )
}
