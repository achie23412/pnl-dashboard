"use client"
import type { DailyBriefingRow } from "@/lib/types"

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtDate(d: string) {
  const date = new Date(d + "T12:00:00")
  const day = date.toLocaleDateString("en-US", { weekday: "short" })
  return `${day} ${date.getDate()}/${date.getMonth() + 1}`
}

function RoasCell({ roas }: { roas: number }) {
  const color = roas >= 2.5 ? "var(--green)" : roas >= 1 ? "var(--orange)" : "var(--red)"
  return <span style={{ color }}>{roas.toFixed(2)}x</span>
}

function RefundCell({ rate }: { rate: number }) {
  const color = rate <= 3 ? "var(--green)" : rate <= 5 ? "var(--orange)" : "var(--red)"
  return <span style={{ color }}>{rate.toFixed(1)}%</span>
}

function ProfitBar({ profit, maxProfit }: { profit: number; maxProfit: number }) {
  if (maxProfit === 0) return null
  const pct = Math.min(Math.abs(profit) / maxProfit * 100, 100)
  const isPositive = profit >= 0
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-[11px] font-semibold tabular-nums"
        style={{ color: isPositive ? "var(--green)" : "var(--red)", minWidth: 52, textAlign: "right" }}
      >
        {profit < 0 ? "−" : ""}€{fmt(Math.abs(profit))}
      </span>
      <div className="flex-1 h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.04)", minWidth: 32 }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: isPositive
              ? "linear-gradient(90deg, rgba(52,211,153,0.6), rgba(52,211,153,0.2))"
              : "linear-gradient(90deg, rgba(248,113,113,0.6), rgba(248,113,113,0.2))",
          }}
        />
      </div>
    </div>
  )
}

export function DailyTable({ data }: { data: DailyBriefingRow[] }) {
  if (data.length === 0) return null

  const maxProfit = Math.max(...data.map((r) => Math.abs(r.profit)), 1)

  const COLS = [
    { key: "date", label: "Date", align: "left" as const },
    { key: "revenue", label: "Revenue", align: "right" as const },
    { key: "orders", label: "Orders", align: "right" as const },
    { key: "spend", label: "Ad Spend", align: "right" as const },
    { key: "roas", label: "ROAS", align: "right" as const },
    { key: "refund", label: "Refund", align: "right" as const },
    { key: "cogs", label: "COGS", align: "right" as const },
    { key: "profit", label: "Net Profit", align: "right" as const },
  ]

  return (
    <div className="glass rounded-xl overflow-hidden relative">
      <div
        className="absolute top-0 left-0 w-full h-[2px]"
        style={{ background: "linear-gradient(90deg, rgba(99,102,241,0.5), transparent 60%)" }}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr>
              {COLS.map((col) => (
                <th
                  key={col.key}
                  className={`${col.align === "left" ? "text-left" : "text-right"} px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider`}
                  style={{ color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const isEven = i % 2 === 0
              return (
                <tr
                  key={row.date}
                  className="transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                  style={{
                    background: isEven ? "transparent" : "rgba(255,255,255,0.015)",
                    opacity: row.isToday ? 0.5 : 1,
                  }}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-[11px] font-medium" style={{ color: "var(--text)" }}>{fmtDate(row.date)}</span>
                    {row.isToday && (
                      <span
                        className="ml-1.5 px-1 py-px rounded text-[8px] font-semibold uppercase"
                        style={{ background: "rgba(212,144,58,0.15)", color: "var(--orange)" }}
                      >
                        Live
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: "var(--text)" }}>€{fmt(row.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{row.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: "var(--text)" }}>€{fmt(row.spend)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium"><RoasCell roas={row.roas} /></td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium"><RefundCell rate={row.refundRate} /></td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--orange)" }}>€{fmt(row.cogs)}</td>
                  <td className="px-3 py-2" style={{ minWidth: 120 }}>
                    <ProfitBar profit={row.profit} maxProfit={maxProfit} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
