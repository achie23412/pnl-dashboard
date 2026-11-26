"use client"
// Red "Risky" badge for a product with too many refunds; links to Risky Products.
import type { ProductRisk } from "@/lib/refund-loss"

export function RiskyBadge({ risk }: { risk: ProductRisk | null }) {
  if (!risk) return null
  const rate = risk.risky_window === "30d" ? risk.rate_30 : risk.rate_all
  const orders = risk.risky_window === "30d" ? `${risk.refunded_30}/${risk.orders_30} orders, 30 days` : `${risk.refunded_all}/${risk.orders_all} orders, all-time`
  return (
    <a
      href="/risky-products"
      onClick={(e) => e.stopPropagation()}
      title={`${rate}% refunded (${orders}) · €${risk.net_loss_eur.toFixed(0)} net refund loss`}
      className="shrink-0 inline-flex items-center rounded px-1.5 py-0.5 ml-1.5 align-middle text-[9px] font-semibold whitespace-nowrap"
      style={{ background: "rgba(248,113,113,0.15)", color: "var(--red)", border: "1px solid rgba(248,113,113,0.3)" }}
    >
      Risky {rate}%
    </a>
  )
}
