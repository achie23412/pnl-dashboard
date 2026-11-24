"use client"
import type { StoreKPI } from "@/lib/types"
import { STORE_COLORS } from "@/lib/constants"

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-[5px]" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[12px] font-semibold tabular-nums" style={{ color: color || "var(--text)" }}>
        {value}
      </span>
    </div>
  )
}

export function StoreComparison({ stores }: { stores: StoreKPI[] }) {
  if (stores.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {stores.map((s) => {
        const color = STORE_COLORS[s.store] || "#666"
        const profitColor = s.profit >= 0 ? "var(--green)" : "var(--red)"
        const roasColor = s.roas >= 2.5 ? "var(--green)" : s.roas >= 1 ? "var(--orange)" : "var(--red)"
        const refundColor = s.refundRate >= 5 ? "var(--red)" : "var(--green)"

        return (
          <div key={s.store} className="glass rounded-xl p-3.5 transition-colors hover:bg-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{s.store}</div>
            </div>

            <div className="text-[20px] font-bold tracking-tight leading-none" style={{ color: profitColor }}>
              {s.profit < 0 ? "−" : ""}€{fmt(Math.abs(s.profit))}
            </div>
            <div className="text-[9px] uppercase tracking-widest mt-0.5 mb-3" style={{ color: "var(--text-dim)" }}>
              Net Profit
            </div>

            {/* Metrics */}
            <div>
              <Metric label="Revenue" value={`€${fmt(s.revenue)}`} />
              <Metric label="Ad Spend" value={`€${fmt(s.spend)}`} />
              <Metric label="Orders" value={fmt(s.orders)} color="var(--text-muted)" />
              <Metric label="ROAS" value={`${s.roas.toFixed(2)}x`} color={roasColor} />
              <div className="flex items-center justify-between pt-[5px]">
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Refund Rate</span>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: refundColor }}>
                  {s.refundRate.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
