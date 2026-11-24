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

export function DailyTable({ data }: { data: DailyBriefingRow[] }) {
  if (data.length === 0) return null

  return (
    <div
      className="rounded-xl border overflow-x-auto"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Date</th>
            <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Revenue</th>
            <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Orders</th>
            <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Ad Spend</th>
            <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>ROAS</th>
            <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Refund Rate</th>
            <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>COGS</th>
            <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Net Profit</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const profitColor = row.profit >= 0 ? "var(--green)" : "var(--red)"
            return (
              <tr
                key={row.date}
                style={{
                  borderBottom: "1px solid var(--border)",
                  opacity: row.isToday ? 0.6 : 1,
                }}
              >
                <td className="px-4 py-2.5">
                  <span style={{ color: "var(--text)" }}>{fmtDate(row.date)}</span>
                  {row.isToday && (
                    <span
                      className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
                      style={{ background: "var(--orange)22", color: "var(--orange)" }}
                    >
                      Provisional
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>€{fmt(row.revenue)}</td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>{row.orders}</td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>€{fmt(row.spend)}</td>
                <td className="px-4 py-2.5 text-right font-mono"><RoasCell roas={row.roas} /></td>
                <td className="px-4 py-2.5 text-right font-mono"><RefundCell rate={row.refundRate} /></td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: "var(--orange)" }}>€{fmt(row.cogs)}</td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: profitColor }}>€{fmt(row.profit)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
