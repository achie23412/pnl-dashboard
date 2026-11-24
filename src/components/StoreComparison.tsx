"use client"
import type { StoreKPI } from "@/lib/types"
import { STORE_COLORS } from "@/lib/constants"

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function StatusDot({ value, thresholds }: { value: number; thresholds: [number, number] }) {
  const color = value >= thresholds[1] ? "var(--green)" : value >= thresholds[0] ? "var(--orange)" : "var(--red)"
  return <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />
}

function RefundDot({ rate }: { rate: number }) {
  const color = rate <= 3 ? "var(--green)" : rate <= 5 ? "var(--orange)" : "var(--red)"
  return <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />
}

export function StoreComparison({ stores }: { stores: StoreKPI[] }) {
  if (stores.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {stores.map((s) => {
        const color = STORE_COLORS[s.store] || "#666"
        const profitColor = s.profit >= 0 ? "var(--green)" : "var(--red)"
        return (
          <div key={s.store} className="glass rounded-xl p-4 transition-colors hover:bg-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{s.store}</div>
            </div>
            <div className="grid grid-cols-2 gap-y-3 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--text-dim)" }}>Revenue</div>
                <div className="font-medium" style={{ color: "var(--text)" }}>€{fmt(s.revenue)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--text-dim)" }}>Ad Spend</div>
                <div className="font-medium" style={{ color: "var(--text)" }}>€{fmt(s.spend)}</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--text-dim)" }}>
                  ROAS <StatusDot value={s.roas} thresholds={[1, 2.5]} />
                </div>
                <div className="font-medium" style={{ color: "var(--text)" }}>{s.roas.toFixed(2)}x</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--text-dim)" }}>
                  Refund <RefundDot rate={s.refundRate} />
                </div>
                <div className="font-medium" style={{ color: "var(--text)" }}>{s.refundRate.toFixed(1)}%</div>
              </div>
              <div className="col-span-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--text-dim)" }}>Net Profit</div>
                <div className="font-semibold" style={{ color: profitColor }}>€{fmt(s.profit)}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
