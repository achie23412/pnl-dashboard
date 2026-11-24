"use client"
import type { StoreKPI } from "@/lib/types"
import { STORE_COLORS } from "@/lib/constants"

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function StoreComparison({ stores }: { stores: StoreKPI[] }) {
  if (stores.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {stores.map((s) => {
        const color = STORE_COLORS[s.store] || "#666"
        const profitColor = s.profit >= 0 ? "var(--green)" : "var(--red)"
        const roasColor = s.roas >= 2.5 ? "var(--green)" : s.roas >= 1 ? "var(--orange)" : "var(--red)"
        return (
          <div key={s.store} className="glass rounded-xl p-4 transition-colors hover:bg-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{s.store}</div>
            </div>

            <div className="text-xl font-semibold tracking-tight mb-0.5" style={{ color: profitColor }}>
              €{fmt(s.profit)}
            </div>
            <div className="text-[11px] mb-4" style={{ color: "var(--text-dim)" }}>net profit</div>

            <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span>€{fmt(s.revenue)} rev</span>
              <span style={{ color: roasColor }}>{s.roas.toFixed(2)}x</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
