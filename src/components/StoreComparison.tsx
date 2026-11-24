"use client"
import type { StoreKPI } from "@/lib/types"
import { STORE_COLORS } from "@/lib/constants"

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function RoasBadge({ roas }: { roas: number }) {
  const level = roas >= 2.5 ? "good" : roas >= 1 ? "mid" : "bad"
  const config = {
    good: { bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)", color: "#34d399", label: "Strong" },
    mid:  { bg: "rgba(212,144,58,0.12)", border: "rgba(212,144,58,0.25)", color: "#D4903A", label: "Break-even" },
    bad:  { bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.25)", color: "#f87171", label: "Below 1x" },
  }[level]

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
      style={{ background: config.bg, border: `1px solid ${config.border}`, color: config.color }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {level === "good" ? (
          <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>
        ) : level === "mid" ? (
          <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>
        ) : (
          <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>
        )}
      </svg>
      {roas.toFixed(2)}x
    </div>
  )
}

function RefundBadge({ rate }: { rate: number }) {
  const isOk = rate < 5
  const bg = isOk ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.12)"
  const border = isOk ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.25)"
  const color = isOk ? "var(--text-muted)" : "#f87171"

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
      {rate.toFixed(1)}%
    </div>
  )
}

function MetricRow({ label, value, dimValue }: { label: string; value: string; dimValue?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>{label}</span>
      <span className="text-[12px] font-medium tabular-nums" style={{ color: dimValue ? "var(--text-muted)" : "var(--text)" }}>
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

        return (
          <div key={s.store} className="glass rounded-xl p-4 transition-colors hover:bg-[rgba(255,255,255,0.06)]">
            {/* Store header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{s.store}</div>
            </div>

            {/* Hero profit */}
            <div className="text-2xl font-semibold tracking-tight" style={{ color: profitColor }}>
              {s.profit < 0 ? "−" : ""}€{fmt(Math.abs(s.profit))}
            </div>
            <div className="text-[10px] uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>net profit</div>

            {/* Metrics */}
            <div className="space-y-1.5 mb-4" style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
              <MetricRow label="Revenue" value={`€${fmt(s.revenue)}`} />
              <MetricRow label="Ad Spend" value={`€${fmt(s.spend)}`} />
              <MetricRow label="Orders" value={fmt(s.orders)} dimValue />
            </div>

            {/* Status badges */}
            <div className="flex flex-wrap gap-1.5">
              <RoasBadge roas={s.roas} />
              <RefundBadge rate={s.refundRate} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
