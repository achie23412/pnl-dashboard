"use client"
import { useState } from "react"
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

function ProfitBar({ profit, maxProfit, revenue }: { profit: number; maxProfit: number; revenue: number }) {
  if (maxProfit === 0) return null
  const pct = Math.min(Math.abs(profit) / maxProfit * 100, 100)
  const isPositive = profit >= 0
  const profitPct = revenue > 0 ? (profit / revenue) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <div className="w-[40px] h-[5px] rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: isPositive
              ? "rgba(52,211,153,0.7)"
              : "rgba(248,113,113,0.7)",
          }}
        />
      </div>
      <span
        className="text-[11px] font-semibold tabular-nums"
        style={{ color: isPositive ? "var(--green)" : "var(--red)" }}
      >
        {profit < 0 ? "−" : ""}€{fmt(Math.abs(profit))}
      </span>
      <span
        className="text-[10px] tabular-nums"
        style={{ color: profitPct >= 20 ? "var(--green)" : profitPct >= 0 ? "var(--orange)" : "var(--red)" }}
      >
        {profitPct < 0 ? "−" : ""}{Math.abs(profitPct).toFixed(1)}%
      </span>
    </div>
  )
}

const VISIBLE_DAYS = 7

export function DailyTable({ data }: { data: DailyBriefingRow[] }) {
  const [expanded, setExpanded] = useState(false)
  if (data.length === 0) return null

  // Newest day on top; only the latest 7 days unless expanded.
  const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date))
  const rows = expanded ? sorted : sorted.slice(0, VISIBLE_DAYS)
  const hidden = sorted.length - rows.length

  const maxProfit = Math.max(...data.map((r) => Math.abs(r.profit)), 1)

  const COLS = [
    { key: "date", label: "Date", align: "left" as const },
    { key: "revenue", label: "Revenue", align: "right" as const },
    { key: "orders", label: "Orders", align: "right" as const },
    { key: "spend", label: "Ad Spend", align: "right" as const },
    { key: "roas", label: "ROAS", align: "right" as const },
    { key: "refund", label: "Refund", align: "right" as const },
    { key: "cogs", label: "COGS", align: "right" as const },
    { key: "cogsPct", label: "COGS %", align: "right" as const },
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
            {rows.map((row, i) => {
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
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: row.revenue > 0 ? (row.cogs / row.revenue * 100 > 35 ? "var(--red)" : row.cogs / row.revenue * 100 > 25 ? "var(--orange)" : "var(--text-muted)") : "var(--text-dim)" }}>
                    {row.revenue > 0 ? `${(row.cogs / row.revenue * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProfitBar profit={row.profit} maxProfit={maxProfit} revenue={row.revenue} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > VISIBLE_DAYS && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full text-[10px] font-medium py-2 transition-colors hover:bg-[rgba(255,255,255,0.03)]"
          style={{ color: "var(--text-muted)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {expanded ? "Show last 7 days only ▴" : `Show ${hidden} more day${hidden === 1 ? "" : "s"} ▾`}
        </button>
      )}
    </div>
  )
}
