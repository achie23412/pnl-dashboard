"use client"
import type { StoreKPI } from "@/lib/types"
import { STORE_COLORS } from "@/lib/constants"

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function RoasPill({ roas }: { roas: number }) {
  const color = roas >= 2.5 ? "var(--green)" : roas >= 1 ? "var(--orange)" : "var(--red)"
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: `${color}22`, color }}
    >
      {roas.toFixed(2)}x
    </span>
  )
}

function RefundPill({ rate }: { rate: number }) {
  const color = rate <= 3 ? "var(--green)" : rate <= 5 ? "var(--orange)" : "var(--red)"
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: `${color}22`, color }}
    >
      {rate.toFixed(1)}%
    </span>
  )
}

export function StoreComparison({ stores }: { stores: StoreKPI[] }) {
  if (stores.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {stores.map((s) => {
        const color = STORE_COLORS[s.store] || "#666"
        const profitColor = s.profit >= 0 ? "var(--green)" : "var(--red)"
        return (
          <div
            key={s.store}
            className="rounded-xl p-4 border"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <div className="text-sm font-medium" style={{ color: "var(--text)" }}>{s.store}</div>
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-xs">
              <div>
                <div style={{ color: "var(--text-muted)" }}>Revenue</div>
                <div className="font-medium" style={{ color: "var(--text)" }}>€{fmt(s.revenue)}</div>
              </div>
              <div>
                <div style={{ color: "var(--text-muted)" }}>Ad Spend</div>
                <div className="font-medium" style={{ color: "var(--text)" }}>€{fmt(s.spend)}</div>
              </div>
              <div>
                <div style={{ color: "var(--text-muted)" }}>ROAS</div>
                <div><RoasPill roas={s.roas} /></div>
              </div>
              <div>
                <div style={{ color: "var(--text-muted)" }}>Refund Rate</div>
                <div><RefundPill rate={s.refundRate} /></div>
              </div>
              <div className="col-span-2 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                <div style={{ color: "var(--text-muted)" }}>Net Profit</div>
                <div className="font-medium" style={{ color: profitColor }}>€{fmt(s.profit)}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
